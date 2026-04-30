import type { FastifyInstance } from "fastify";
import type { StorageProvider } from "@kfang/ghstat-persistence";
import {
  calcPRVelocity,
  calcContributorStats,
  calcRepoHealth,
  calcOrgRollups,
  calcReviewCycle,
  calcCommentAnalysis,
} from "@kfang/ghstat-stats";
import type { GhPullRequest, GhPRReview } from "@kfang/ghstat-github-data";

export function registerStatRoutes(app: FastifyInstance, storage: StorageProvider): void {
  // GET /api/stats/org/:org
  app.get<{ Params: { org: string } }>("/api/stats/org/:org", async (req, reply) => {
    const { org } = req.params;
    const repos = await storage.getRepos({ org });
    const prsByRepo = new Map<string, GhPullRequest[]>();
    const allReviews: GhPRReview[] = [];
    for (const repo of repos) {
      prsByRepo.set(repo.full_name, await storage.getPullRequests(repo.full_name));
      allReviews.push(...(await storage.getReviews(repo.full_name)));
    }
    const allPRs = [...prsByRepo.values()].flat();
    const allComments = (
      await Promise.all(repos.map((r) => storage.getComments(r.full_name)))
    ).flat();
    const reviewsByPR = groupReviewsByPR(allReviews);
    return reply.send({
      ...calcOrgRollups(repos, prsByRepo, org),
      reviewCycle: calcReviewCycle(allPRs, reviewsByPR),
      commentAnalysis: calcCommentAnalysis(allComments, allPRs),
    });
  });

  // GET /api/stats/:owner/:repo
  app.get<{ Params: { owner: string; repo: string } }>(
    "/api/stats/:owner/:repo",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const repos = await storage.getRepos({ org: owner });
      const repoData = repos.find((r) => r.full_name === fullName);
      if (!repoData) return reply.status(404).send("Not found");
      const prs = await storage.getPullRequests(fullName);
      const reviews = await storage.getReviews(fullName);
      const comments = await storage.getComments(fullName);
      const reviewsByPR = groupReviewsByPR(reviews);

      return reply.send({
        repo: fullName,
        velocity: calcPRVelocity(prs),
        contributors: calcContributorStats(prs),
        health: calcRepoHealth(repoData, prs),
        reviewCycle: calcReviewCycle(prs, reviewsByPR),
        commentAnalysis: calcCommentAnalysis(comments, prs),
      });
    },
  );
}

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
