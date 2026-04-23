import type { GhRepo, GhPullRequest } from "@kfang/ghstat-github-data";
import { calcPRVelocity } from "./pr-velocity.js";
import { calcContributorStats } from "./contributors.js";

export interface OrgRollupStats {
  org: string;
  totalRepos: number;
  activeRepos: number;
  archivedRepos: number;
  totalStars: number;
  totalForks: number;
  totalOpenIssues: number;
  totalPRs: number;
  totalMergedPRs: number;
  totalOpenPRs: number;
  uniqueContributors: number;
  /** Top 5 repos by merged PRs */
  topReposByActivity: Array<{ repoFullName: string; mergedPRs: number }>;
  /** Top 5 contributors across org */
  topContributors: Array<{ login: string; mergedPRs: number }>;
  /** Languages used, sorted by repo count */
  languages: Array<{ language: string; repoCount: number }>;
}

export function calcOrgRollups(
  repos: GhRepo[],
  prsByRepo: Map<string, GhPullRequest[]>,
  org: string,
): OrgRollupStats {
  const allPRs = [...prsByRepo.values()].flat();

  const velocity = calcPRVelocity(allPRs);
  const contributors = calcContributorStats(allPRs);

  // Language breakdown
  const langCount = new Map<string, number>();
  for (const repo of repos) {
    if (repo.language) {
      langCount.set(repo.language, (langCount.get(repo.language) ?? 0) + 1);
    }
  }
  const languages = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([language, repoCount]) => ({ language, repoCount }));

  // Top repos by merged PRs
  const repoActivity: Array<{ repoFullName: string; mergedPRs: number }> = [];
  for (const [repoFullName, prs] of prsByRepo) {
    const merged = prs.filter((p) => p.merged_at !== null).length;
    repoActivity.push({ repoFullName, mergedPRs: merged });
  }
  repoActivity.sort((a, b) => b.mergedPRs - a.mergedPRs);

  return {
    org,
    totalRepos: repos.length,
    activeRepos: repos.filter((r) => !r.archived).length,
    archivedRepos: repos.filter((r) => r.archived).length,
    totalStars: repos.reduce((s, r) => s + r.stargazers_count, 0),
    totalForks: repos.reduce((s, r) => s + r.forks_count, 0),
    totalOpenIssues: repos.reduce((s, r) => s + r.open_issues_count, 0),
    totalPRs: velocity.totalPRs,
    totalMergedPRs: velocity.mergedPRs,
    totalOpenPRs: velocity.openPRs,
    uniqueContributors: contributors.uniqueContributors,
    topReposByActivity: repoActivity.slice(0, 5),
    topContributors: contributors.contributors
      .slice(0, 5)
      .map((c) => ({ login: c.login, mergedPRs: c.mergedPRs })),
    languages,
  };
}
