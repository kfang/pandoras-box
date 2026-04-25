import type { SeriesMetadata, FileFormat, MatchResult } from "../types";
import type { SearchOptions } from "../providers/types";
import type { CachedProvider } from "../providers/cache";
import { ask, promptChoice } from "../utils/prompt";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;

  // Levenshtein-based similarity
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function scoreMatch(query: string, series: SeriesMetadata): number {
  const titles = [
    series.title.romaji,
    series.title.english,
    series.title.native,
  ].filter(Boolean) as string[];

  if (titles.length === 0) return 0;
  return Math.max(...titles.map((t) => similarity(query, t)));
}

export async function matchSeries(
  seriesName: string,
  format: FileFormat,
  provider: CachedProvider,
  interactive: boolean
): Promise<MatchResult | null> {
  // Check cache for confirmed mapping
  const cachedId = provider.getConfirmedMapping(seriesName);
  if (cachedId !== undefined) {
    const series = await provider.getSeriesById(cachedId);
    if (series) {
      return { series, confidence: 1, confirmed: true };
    }
  }

  const searchFormat: SearchOptions["format"] =
    format === "epub" ? "NOVEL" : "MANGA";

  let results = await provider.searchSeries(seriesName, {
    format: searchFormat,
  });

  // If no results with format filter, try without
  if (results.length === 0) {
    results = await provider.searchSeries(seriesName);
  }

  // If still no results and name contains " - ", try the prefix (e.g. "Girl Meets Dragon")
  if (results.length === 0) {
    const dashIdx = seriesName.indexOf(" - ");
    if (dashIdx !== -1) {
      const prefix = seriesName.substring(0, dashIdx);
      results = await provider.searchSeries(prefix, { format: searchFormat });
      if (results.length === 0) {
        results = await provider.searchSeries(prefix);
      }
    }
  }

  if (results.length === 0) {
    if (interactive) {
      console.error(`\nNo results found for "${seriesName}".`);
      const term = await ask("Enter search term (or empty to skip): ");
      if (term) {
        results = await provider.searchSeries(term);
      }
    }
    if (results.length === 0) return null;
  }

  // Score and sort
  const scored = results
    .map((series) => ({
      series,
      confidence: scoreMatch(seriesName, series),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  const displayTitle =
    best.series.title.english || best.series.title.romaji || "Unknown";

  // High confidence: auto-accept
  if (best.confidence >= 0.85) {
    console.error(
      `  ✓ "${seriesName}" → "${displayTitle}" (${(best.confidence * 100).toFixed(0)}%)`
    );
    provider.setConfirmedMapping(seriesName, best.series.id);
    return { ...best, confirmed: true };
  }

  if (!interactive) {
    console.error(
      `  ? "${seriesName}" → "${displayTitle}" (${(best.confidence * 100).toFixed(0)}%) — skipped (non-interactive)`
    );
    return null;
  }

  // Medium confidence: prompt
  if (best.confidence >= 0.5) {
    const choice = await promptChoice(
      `\n  Is "${displayTitle}" correct for "${seriesName}"?`,
      []
    );
    if (choice === "accept") {
      provider.setConfirmedMapping(seriesName, best.series.id);
      return { ...best, confirmed: true };
    }
    if (choice !== "reject") {
      // User entered a search term
      return matchSeries(choice, format, provider, interactive);
    }
    return null;
  }

  // Low confidence: ask for correction
  console.error(`\n  Low confidence match for "${seriesName}":`);
  for (let i = 0; i < Math.min(5, scored.length); i++) {
    const s = scored[i];
    const title =
      s.series.title.english || s.series.title.romaji || "Unknown";
    console.error(
      `    ${i + 1}. "${title}" (${(s.confidence * 100).toFixed(0)}%)`
    );
  }

  const answer = await ask(
    "  Enter number to select, search term, or empty to skip: "
  );
  if (!answer) return null;

  const num = parseInt(answer, 10);
  if (!isNaN(num) && num >= 1 && num <= scored.length) {
    const selected = scored[num - 1];
    provider.setConfirmedMapping(seriesName, selected.series.id);
    return { series: selected.series, confidence: selected.confidence, confirmed: true };
  }

  // Treat as search term
  return matchSeries(answer, format, provider, interactive);
}
