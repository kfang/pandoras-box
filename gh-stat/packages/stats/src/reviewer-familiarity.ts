import type { GhPullRequest } from "@kfang/ghstat-github-data";
import type { ResolvedCodeOwnerGroup } from "./code-owner-demand.js";

export interface GroupFamiliarity {
  teamSlug: string;
  totalMembers: number;
  membersWithRecentPR: number;
  familiarityPct: number;
}

export interface IndividualFamiliarity {
  login: string;
  hasRecentPR: boolean;
  recentPRCount: number;
  lastPRDate: string | null;
}

export interface ReviewerFamiliarityStats {
  repoFullName: string;
  groupFamiliarity: GroupFamiliarity[];
  individualFamiliarity: IndividualFamiliarity[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calcReviewerFamiliarity(
  prs: GhPullRequest[],
  repoFullName: string,
  groups: ResolvedCodeOwnerGroup[],
  lookbackDays: number,
  now?: Date,
): ReviewerFamiliarityStats {
  const nowMs = (now ?? new Date()).getTime();
  const sinceMs = nowMs - lookbackDays * MS_PER_DAY;

  // PRs authored in this repo within the lookback window
  const recentPRs = prs.filter((pr) => {
    const t = new Date(pr.created_at).getTime();
    return t >= sinceMs && t <= nowMs;
  });

  // Build a map of author -> their PRs in this window
  const authorPRs = new Map<string, GhPullRequest[]>();
  for (const pr of recentPRs) {
    let list = authorPRs.get(pr.user_login);
    if (!list) {
      list = [];
      authorPRs.set(pr.user_login, list);
    }
    list.push(pr);
  }

  // Groups that own this repo
  const relevantGroups = groups.filter((g) => g.repos.includes(repoFullName));

  const groupFamiliarity: GroupFamiliarity[] = relevantGroups.map((group) => {
    const membersWithPR = group.members.filter((m) => authorPRs.has(m));
    const pct = group.members.length > 0
      ? Math.round((membersWithPR.length / group.members.length) * 10000) / 100
      : 0;
    return {
      teamSlug: group.teamSlug,
      totalMembers: group.members.length,
      membersWithRecentPR: membersWithPR.length,
      familiarityPct: pct,
    };
  });

  // Individual familiarity: all members across relevant groups
  const allMembers = new Set<string>();
  for (const group of relevantGroups) {
    for (const member of group.members) {
      allMembers.add(member);
    }
  }

  const individualFamiliarity: IndividualFamiliarity[] = [...allMembers].map((login) => {
    const memberPRs = authorPRs.get(login) ?? [];
    const lastPR = memberPRs.length > 0
      ? memberPRs
          .map((pr) => pr.created_at)
          .sort()
          .pop() ?? null
      : null;
    return {
      login,
      hasRecentPR: memberPRs.length > 0,
      recentPRCount: memberPRs.length,
      lastPRDate: lastPR,
    };
  });

  individualFamiliarity.sort((a, b) => b.recentPRCount - a.recentPRCount);

  return { repoFullName, groupFamiliarity, individualFamiliarity };
}
