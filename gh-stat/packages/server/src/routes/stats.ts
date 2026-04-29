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

export async function handleStats(
  req: Request,
  storage: StorageProvider,
): Promise<Response | null> {
  const url = new URL(req.url);

  // GET /api/stats/org/:org
  const orgMatch = url.pathname.match(/^\/api\/stats\/org\/([^/]+)$/);
  if (orgMatch) {
    const [, org] = orgMatch;
    const repos = await storage.getRepos({ org: org! });
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
    return json({
      ...calcOrgRollups(repos, prsByRepo, org!),
      reviewCycle: calcReviewCycle(allPRs, reviewsByPR),
      commentAnalysis: calcCommentAnalysis(allComments, allPRs),
    });
  }

  // GET /api/stats/:owner/:repo
  const repoMatch = url.pathname.match(/^\/api\/stats\/([^/]+)\/([^/]+)$/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;
    const fullName = `${owner}/${repo}`;
    const repos = await storage.getRepos({ org: owner! });
    const repoData = repos.find((r) => r.full_name === fullName);
    if (!repoData) return new Response("Not found", { status: 404 });
    const prs = await storage.getPullRequests(fullName);
    const reviews = await storage.getReviews(fullName);
    const comments = await storage.getComments(fullName);
    const reviewsByPR = groupReviewsByPR(reviews);

    return json({
      repo: fullName,
      velocity: calcPRVelocity(prs),
      contributors: calcContributorStats(prs),
      health: calcRepoHealth(repoData, prs),
      reviewCycle: calcReviewCycle(prs, reviewsByPR),
      commentAnalysis: calcCommentAnalysis(comments, prs),
    });
  }

  return null;
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

function json(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
