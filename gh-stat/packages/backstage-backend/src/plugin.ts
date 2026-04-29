import {
  createBackendPlugin,
  coreServices,
} from "@backstage/backend-plugin-api";
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { createGitHubClient } from "@kfang/ghstat-github-data";
import { createBackstageProvider, syncAll } from "@kfang/ghstat-persistence";
import type { BackstageDatabaseService } from "@kfang/ghstat-persistence";
import {
  calcPRVelocity,
  calcContributorStats,
  calcRepoHealth,
  calcOrgRollups,
  calcReviewCycle,
  calcCommentAnalysis,
} from "@kfang/ghstat-stats";
import type { GhPullRequest, GhPRReview } from "@kfang/ghstat-github-data";

function groupReviewsByPR(reviews: GhPRReview[]): Map<number, GhPRReview[]> {
  const map = new Map<number, GhPRReview[]>();
  for (const r of reviews) {
    let arr = map.get(r.pr_number);
    if (!arr) {
      arr = [];
      map.set(r.pr_number, arr);
    }
    arr.push(r);
  }
  return map;
}

export const ghStatPlugin = createBackendPlugin({
  pluginId: "gh-stat",
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        database: coreServices.database,
        httpRouter: coreServices.httpRouter,
        scheduler: coreServices.scheduler,
      },
      async init({ logger, config, database, httpRouter, scheduler }) {
        const token = config.getString("ghStat.github.token");
        const orgs = config.getOptionalStringArray("ghStat.github.orgs") ?? [];
        const repos = config.getOptionalStringArray("ghStat.github.repos") ?? [];
        const intervalSeconds = config.getOptionalNumber("ghStat.refresh.interval") ?? 3600;

        const client = createGitHubClient(token);
        const storage = createBackstageProvider(
          database as unknown as BackstageDatabaseService,
        );

        const syncConfig = { github: { orgs, repos } };

        // Schedule periodic sync
        await scheduler.scheduleTask({
          id: "gh-stat-sync",
          frequency: { seconds: intervalSeconds },
          timeout: { minutes: 30 },
          async fn() {
            await syncAll(client, storage, syncConfig, logger);
          },
        });

        // REST API routes via Express router
        const router = Router();

        router.get("/repos", async (req: Request, res: Response, next: NextFunction) => {
          try {
            const org = typeof req.query["org"] === "string" ? req.query["org"] : undefined;
            const result = await storage.getRepos(org ? { org } : undefined);
            res.json(result);
          } catch (err) {
            next(err);
          }
        });

        router.get(
          "/stats/org/:org",
          async (req: Request, res: Response, next: NextFunction) => {
            try {
              const { org } = req.params;
              const repoList = await storage.getRepos({ org: org! });
              const prsByRepo = new Map<string, GhPullRequest[]>();
              const allReviews: GhPRReview[] = [];
              for (const r of repoList) {
                prsByRepo.set(r.full_name, await storage.getPullRequests(r.full_name));
                allReviews.push(...(await storage.getReviews(r.full_name)));
              }
              const allPRs = [...prsByRepo.values()].flat();
              const allComments = (
                await Promise.all(repoList.map((r) => storage.getComments(r.full_name)))
              ).flat();
              const reviewsByPR = groupReviewsByPR(allReviews);
              res.json({
                ...calcOrgRollups(repoList, prsByRepo, org!),
                reviewCycle: calcReviewCycle(allPRs, reviewsByPR),
                commentAnalysis: calcCommentAnalysis(allComments, allPRs),
              });
            } catch (err) {
              next(err);
            }
          },
        );

        router.get(
          "/stats/:owner/:repo",
          async (req: Request, res: Response, next: NextFunction) => {
            try {
              const { owner, repo } = req.params;
              const fullName = `${owner}/${repo}`;
              const repoList = await storage.getRepos({ org: owner! });
              const repoData = repoList.find((r) => r.full_name === fullName);
              if (!repoData) {
                res.status(404).json({ error: "Not found" });
                return;
              }
              const prs = await storage.getPullRequests(fullName);
              const reviews = await storage.getReviews(fullName);
              const comments = await storage.getComments(fullName);
              const reviewsByPR = groupReviewsByPR(reviews);
              res.json({
                repo: fullName,
                velocity: calcPRVelocity(prs),
                contributors: calcContributorStats(prs),
                health: calcRepoHealth(repoData, prs),
                reviewCycle: calcReviewCycle(prs, reviewsByPR),
                commentAnalysis: calcCommentAnalysis(comments, prs),
              });
            } catch (err) {
              next(err);
            }
          },
        );

        httpRouter.use(router);
      },
    });
  },
});
