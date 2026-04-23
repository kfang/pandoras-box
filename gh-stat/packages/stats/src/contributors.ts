import type { GhPullRequest } from "@kfang/ghstat-github-data";

export interface ContributorStat {
  login: string;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedUnmergedPRs: number;
  mergeRate: number;
  totalAdditions: number;
  totalDeletions: number;
  totalChangedFiles: number;
}

export interface ContributorStats {
  contributors: ContributorStat[];
  /** Total unique contributors */
  uniqueContributors: number;
  /** Top contributor by merged PRs */
  topContributor: string | null;
}

export function calcContributorStats(prs: GhPullRequest[]): ContributorStats {
  const byLogin = new Map<string, GhPullRequest[]>();
  for (const pr of prs) {
    const list = byLogin.get(pr.user_login) ?? [];
    list.push(pr);
    byLogin.set(pr.user_login, list);
  }

  const contributors: ContributorStat[] = [];
  for (const [login, userPrs] of byLogin) {
    const merged = userPrs.filter((p) => p.merged_at !== null);
    const open = userPrs.filter((p) => p.state === "open");
    const closedUnmerged = userPrs.filter(
      (p) => p.state === "closed" && p.merged_at === null,
    );
    contributors.push({
      login,
      totalPRs: userPrs.length,
      mergedPRs: merged.length,
      openPRs: open.length,
      closedUnmergedPRs: closedUnmerged.length,
      mergeRate: userPrs.length > 0 ? merged.length / userPrs.length : 0,
      totalAdditions: userPrs.reduce((s, p) => s + p.additions, 0),
      totalDeletions: userPrs.reduce((s, p) => s + p.deletions, 0),
      totalChangedFiles: userPrs.reduce((s, p) => s + p.changed_files, 0),
    });
  }

  contributors.sort((a, b) => b.mergedPRs - a.mergedPRs);

  return {
    contributors,
    uniqueContributors: contributors.length,
    topContributor: contributors[0]?.login ?? null,
  };
}
