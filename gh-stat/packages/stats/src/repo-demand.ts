import type { GhPullRequest } from "@kfang/ghstat-github-data";

export interface RepoDemandStats {
  repoFullName: string;
  totalPRsOpened: number;
  daysInWindow: number;
  avgPRsPerDay: number;
  avgPRsPerWeek: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function calcRepoDemand(
  prs: GhPullRequest[],
  repoFullName: string,
  window: { since: Date; until: Date },
): RepoDemandStats {
  const sinceMs = window.since.getTime();
  const untilMs = window.until.getTime();

  const opened = prs.filter((pr) => {
    const t = new Date(pr.created_at).getTime();
    return t >= sinceMs && t < untilMs;
  });

  const daysInWindow = Math.max(1, (untilMs - sinceMs) / MS_PER_DAY);
  const avgPRsPerDay = opened.length / daysInWindow;

  return {
    repoFullName,
    totalPRsOpened: opened.length,
    daysInWindow: Math.round(daysInWindow),
    avgPRsPerDay: Math.round(avgPRsPerDay * 100) / 100,
    avgPRsPerWeek: Math.round(avgPRsPerDay * 7 * 100) / 100,
  };
}
