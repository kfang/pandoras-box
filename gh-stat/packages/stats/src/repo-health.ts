import type { GhRepo, GhPullRequest } from "@kfang/ghstat-github-data";

export interface RepoHealthStats {
  repoFullName: string;
  language: string | null;
  /** Days since last push */
  daysSinceLastPush: number;
  /** True if no push in 90+ days */
  isStale: boolean;
  /** Number of open PRs */
  openPRBacklog: number;
  /** Number of open issues (from GitHub's pre-calculated count) */
  openIssues: number;
  /** Estimated bus factor: # of contributors with ≥10% of merged PRs */
  busFactor: number;
  stars: number;
  forks: number;
  archived: boolean;
  topics: string[];
}

export function calcRepoHealth(
  repo: GhRepo,
  prs: GhPullRequest[],
  now: Date = new Date(),
): RepoHealthStats {
  const daysSinceLastPush =
    (now.getTime() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24);

  const openPRs = prs.filter((p) => p.state === "open");
  const mergedPRs = prs.filter((p) => p.merged_at !== null);

  // Bus factor: contributors responsible for ≥10% of merged PRs
  const mergedByUser = new Map<string, number>();
  for (const pr of mergedPRs) {
    mergedByUser.set(pr.user_login, (mergedByUser.get(pr.user_login) ?? 0) + 1);
  }
  const threshold = mergedPRs.length * 0.1;
  const busFactor = mergedPRs.length === 0
    ? 0
    : [...mergedByUser.values()].filter((count) => count >= threshold).length;

  return {
    repoFullName: repo.full_name,
    language: repo.language,
    daysSinceLastPush: Math.floor(daysSinceLastPush),
    isStale: daysSinceLastPush >= 90,
    openPRBacklog: openPRs.length,
    openIssues: repo.open_issues_count,
    busFactor,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    archived: repo.archived,
    topics: repo.topics,
  };
}
