import type { StorageProvider } from "@kfang/ghstat-persistence";
import {
  calcPRVelocity,
  calcContributorStats,
  calcRepoHealth,
  calcOrgRollups,
} from "@kfang/ghstat-stats";
import type { GhPullRequest } from "@kfang/ghstat-github-data";

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
    for (const repo of repos) {
      prsByRepo.set(repo.full_name, await storage.getPullRequests(repo.full_name));
    }
    return json(calcOrgRollups(repos, prsByRepo, org!));
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

    return json({
      repo: fullName,
      velocity: calcPRVelocity(prs),
      contributors: calcContributorStats(prs),
      health: calcRepoHealth(repoData, prs),
    });
  }

  return null;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
