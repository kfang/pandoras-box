export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? null;
}

export function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  if (days < 7) return `${days.toFixed(1)}d`;
  return `${(days / 7).toFixed(1)}w`;
}
