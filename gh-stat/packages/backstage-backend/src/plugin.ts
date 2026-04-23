import {
  createBackendPlugin,
  coreServices,
} from "@backstage/backend-plugin-api";
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { createGitHubClient } from "@kfang/ghstat-github-data";
import { BackstageStorageProvider, syncAll } from "@kfang/ghstat-persistence";
import type { BackstageDatabaseService } from "@kfang/ghstat-persistence";
import {
  calcPRVelocity,
  calcContributorStats,
  calcRepoHealth,
  calcOrgRollups,
} from "@kfang/ghstat-stats";
import type { GhPullRequest } from "@kfang/ghstat-github-data";

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
        const storage = new BackstageStorageProvider(
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
              for (const r of repoList) {
                prsByRepo.set(r.full_name, await storage.getPullRequests(r.full_name));
              }
              res.json(calcOrgRollups(repoList, prsByRepo, org!));
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
              res.json({
                repo: fullName,
                velocity: calcPRVelocity(prs),
                contributors: calcContributorStats(prs),
                health: calcRepoHealth(repoData, prs),
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
