import type { GhPullRequest } from "@kfang/ghstat-github-data";

export interface ResolvedCodeOwnerGroup {
  org: string;
  teamSlug: string;
  members: string[];
  /** Repos where this team appears in CODEOWNERS */
  repos: string[];
}

export interface CodeOwnerDemandGroup {
  teamSlug: string;
  memberCount: number;
  totalPRsOpened: number;
  prsPerEngineer: number;
  byRepo: Array<{ repoFullName: string; prsOpened: number }>;
}

export interface CodeOwnerDemandStats {
  groups: CodeOwnerDemandGroup[];
}

export function calcCodeOwnerDemand(
  groups: ResolvedCodeOwnerGroup[],
  prsByRepo: Map<string, GhPullRequest[]>,
  window: { since: Date; until: Date },
): CodeOwnerDemandStats {
  const sinceMs = window.since.getTime();
  const untilMs = window.until.getTime();

  const result: CodeOwnerDemandGroup[] = [];

  for (const group of groups) {
    if (group.members.length === 0) continue;

    const byRepo: Array<{ repoFullName: string; prsOpened: number }> = [];
    let totalPRsOpened = 0;

    for (const repoFullName of group.repos) {
      const prs = prsByRepo.get(repoFullName) ?? [];
      const opened = prs.filter((pr) => {
        const t = new Date(pr.created_at).getTime();
        return t >= sinceMs && t < untilMs;
      });
      if (opened.length > 0) {
        byRepo.push({ repoFullName, prsOpened: opened.length });
        totalPRsOpened += opened.length;
      }
    }

    result.push({
      teamSlug: group.teamSlug,
      memberCount: group.members.length,
      totalPRsOpened,
      prsPerEngineer: Math.round((totalPRsOpened / group.members.length) * 100) / 100,
      byRepo,
    });
  }

  result.sort((a, b) => b.prsPerEngineer - a.prsPerEngineer);

  return { groups: result };
}
