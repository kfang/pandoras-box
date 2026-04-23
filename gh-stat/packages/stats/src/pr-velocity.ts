import type { GhPullRequest } from "@kfang/ghstat-github-data";

export interface PRVelocityStats {
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  closedUnmergedPRs: number;
  mergeRate: number;
  /** Average milliseconds from created_at to merged_at */
  avgTimeToMergeMs: number | null;
  /** Average milliseconds from created_at to merged_at (human label) */
  avgTimeToMergeLabel: string | null;
  /** p50 cycle time in ms */
  p50CycleTimeMs: number | null;
  /** p90 cycle time in ms */
  p90CycleTimeMs: number | null;
  /** PRs merged per week over the observed window */
  weeklyThroughput: number | null;
  /** ISO date of oldest PR in this set */
  windowStart: string | null;
  /** ISO date of newest PR in this set */
  windowEnd: string | null;
}

export function calcPRVelocity(prs: GhPullRequest[]): PRVelocityStats {
  const total = prs.length;
  const merged = prs.filter((p) => p.merged_at !== null);
  const open = prs.filter((p) => p.state === "open");
  const closedUnmerged = prs.filter((p) => p.state === "closed" && p.merged_at === null);

  const cycleTimes = merged
    .map((p) => new Date(p.merged_at!).getTime() - new Date(p.created_at).getTime())
    .filter((ms) => ms >= 0)
    .sort((a, b) => a - b);

  const avgMs = cycleTimes.length > 0
    ? cycleTimes.reduce((s, v) => s + v, 0) / cycleTimes.length
    : null;

  const p50 = percentile(cycleTimes, 50);
  const p90 = percentile(cycleTimes, 90);

  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let weeklyThroughput: number | null = null;

  if (prs.length > 0) {
    const dates = prs.map((p) => p.created_at).sort();
    windowStart = dates[0] ?? null;
    windowEnd = dates[dates.length - 1] ?? null;

    if (windowStart && windowEnd) {
      const windowMs = new Date(windowEnd).getTime() - new Date(windowStart).getTime();
      const weeks = windowMs / (7 * 24 * 60 * 60 * 1000);
      weeklyThroughput = weeks > 0 ? merged.length / weeks : merged.length;
    }
  }

  return {
    totalPRs: total,
    mergedPRs: merged.length,
    openPRs: open.length,
    closedUnmergedPRs: closedUnmerged.length,
    mergeRate: total > 0 ? merged.length / total : 0,
    avgTimeToMergeMs: avgMs,
    avgTimeToMergeLabel: avgMs !== null ? formatDuration(avgMs) : null,
    p50CycleTimeMs: p50,
    p90CycleTimeMs: p90,
    weeklyThroughput,
    windowStart,
    windowEnd,
  };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? null;
}

function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}
