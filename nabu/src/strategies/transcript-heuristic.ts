import type { Strategy, PipelineContext, TalkBoundary } from "../types";
import { parseSrt, type SrtCue } from "../subtitles";

interface CandidateBoundary {
  gapStart: number;
  gapEnd: number;
  gapDuration: number;
  score: number;
  reasons: string[];
}

/**
 * Score a gap based on its duration.
 */
function scoreGap(duration: number): { score: number; reason: string } {
  if (duration >= 90) return { score: 5, reason: `long gap (${Math.round(duration)}s)` };
  if (duration >= 30) return { score: 3, reason: `medium gap (${Math.round(duration)}s)` };
  if (duration >= 15) return { score: 2, reason: `short gap (${Math.round(duration)}s)` };
  if (duration >= 8) return { score: 1, reason: `brief gap (${Math.round(duration)}s)` };
  return { score: 0, reason: "" };
}

/**
 * Check text around a gap for intro/outro patterns that signal talk boundaries.
 */
function scoreTextPatterns(
  cues: SrtCue[],
  gapStartTime: number,
  gapEndTime: number
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Get text before the gap (last ~60s)
  const beforeText = cues
    .filter((c) => c.startTime >= gapStartTime - 60 && c.startTime <= gapStartTime)
    .map((c) => c.text)
    .join(" ")
    .toLowerCase();

  // Get text after the gap (first ~60s)
  const afterText = cues
    .filter((c) => c.startTime >= gapEndTime && c.startTime <= gapEndTime + 60)
    .map((c) => c.text)
    .join(" ")
    .toLowerCase();

  // Outro patterns (before gap)
  if (/(?:please welcome|give it up|next speaker|next talk)/.test(beforeText)) {
    score += 3;
    reasons.push("intro/handoff before gap");
  }
  if (/(?:thank you(?:\s+(?:so|very))?\s+much|thanks everyone|thanks everybody)/.test(beforeText)) {
    score += 1;
    reasons.push("thanks before gap");
  }
  if (/(?:applause|\[applause\]|give it up|round of applause)/.test(beforeText)) {
    score += 2;
    reasons.push("applause before gap");
  }

  // Intro patterns (after gap)
  if (/(?:welcome everybody|welcome everyone|welcome back|welcome to)/.test(afterText)) {
    score += 2;
    reasons.push("welcome after gap");
  }
  if (/(?:hey everybody|hey everyone|hello everyone|hello everybody|hi everyone|hi everybody|good (?:morning|afternoon|evening))/.test(afterText)) {
    score += 2;
    reasons.push("greeting after gap");
  }
  if (/(?:my name is|i'm \w+ (?:from|and|with)|i am \w+ (?:from|and|with))/.test(afterText)) {
    score += 2;
    reasons.push("speaker intro after gap");
  }
  if (/(?:today (?:i'm|we're|i will|we will|i want|we want)|i'm going to (?:talk|show|present|demo))/.test(afterText)) {
    score += 1;
    reasons.push("topic intro after gap");
  }

  return { score, reasons };
}

/**
 * Find all gaps between consecutive cue start times >= minGap seconds.
 */
function findGaps(cues: SrtCue[], minGap: number): { gapStart: number; gapEnd: number; duration: number }[] {
  const gaps: { gapStart: number; gapEnd: number; duration: number }[] = [];
  for (let i = 1; i < cues.length; i++) {
    const duration = cues[i].startTime - cues[i - 1].startTime;
    if (duration >= minGap) {
      gaps.push({
        gapStart: cues[i - 1].startTime,
        gapEnd: cues[i].startTime,
        duration,
      });
    }
  }
  return gaps;
}

/**
 * Deduplicate boundaries that are within `windowSec` of each other,
 * keeping the highest-scoring one.
 */
function dedup(boundaries: CandidateBoundary[], windowSec: number): CandidateBoundary[] {
  if (boundaries.length === 0) return [];

  const sorted = [...boundaries].sort((a, b) => a.gapEnd - b.gapEnd);
  const result: CandidateBoundary[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1];
    if (sorted[i].gapEnd - last.gapEnd < windowSec) {
      // Keep the higher-scoring one
      if (sorted[i].score > last.score) {
        result[result.length - 1] = sorted[i];
      }
    } else {
      result.push(sorted[i]);
    }
  }

  return result;
}

/** Try to extract speaker name from cues near a talk start */
function extractSpeaker(cues: SrtCue[], startIdx: number): string {
  const window = cues
    .slice(startIdx, Math.min(cues.length, startIdx + 20))
    .map((c) => c.text)
    .join(" ");

  const imMatch = window.match(
    /(?:i(?:'m|'m| am))\s+(\w+(?:\s+\w+)?)\s+(?:and|from|with)/i
  );
  if (imMatch) return imMatch[1];

  const aboutMatch = window.match(
    /(?:about me[,.]?\s*)?(?:i(?:'m|'m| am))\s+(\w+(?:\s+\w+)?)/i
  );
  if (aboutMatch) return aboutMatch[1];

  const welcomeMatch = window.match(
    /(?:welcome|introducing)\s+(\w+(?:\s+\w+){0,2})/i
  );
  if (welcomeMatch) return welcomeMatch[1];

  return "Unknown";
}

/** Try to extract a topic/title from cues near a talk start */
function extractTitle(cues: SrtCue[], startIdx: number, talkIndex: number): string {
  const window = cues
    .slice(startIdx, Math.min(cues.length, startIdx + 30))
    .map((c) => c.text)
    .join(" ");

  const topicMatch = window.match(
    /(?:talk(?:ing)?\s+about|presentation\s+on|topic\s+(?:is|today)|diving.*?into)\s+(.{10,80}?)(?:\.|,|and\s)/i
  );
  if (topicMatch) return cleanTitle(topicMatch[1]);

  const todayMatch = window.match(
    /today\s+(?:we|I)\s+(?:will|are going to|gonna|'ll)\s+(?:be\s+)?(.{10,80}?)(?:\.|,|but\s)/i
  );
  if (todayMatch) return cleanTitle(todayMatch[1]);

  return `Talk ${talkIndex + 1}`;
}

function cleanTitle(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 80);
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Combined gap + text pattern scoring for talk boundary detection.
 *
 * Works for both long-gap conferences (10+ min breaks) and short-gap
 * conferences (8-30s transitions). Gaps are scored by duration and
 * surrounding text is checked for intro/outro patterns. Boundaries
 * above a score threshold are kept.
 */
export const transcriptHeuristicStrategy: Strategy = {
  name: "transcript",

  async analyze(ctx: PipelineContext): Promise<TalkBoundary[]> {
    if (!ctx.subtitlePath) {
      throw new Error(
        "No subtitles available for transcript analysis. Try another strategy."
      );
    }

    const content = await Bun.file(ctx.subtitlePath).text();
    const cues = parseSrt(content);

    if (cues.length === 0) {
      throw new Error("Subtitle file contains no cues.");
    }

    console.log(
      `Analyzing ${cues.length} cues, ` +
        `spanning ${formatTime(cues[0].startTime)} to ${formatTime(cues[cues.length - 1].endTime)}`
    );

    // Find all gaps >= 8s between consecutive cue starts
    const gaps = findGaps(cues, 8);
    console.log(`Found ${gaps.length} gaps >= 8s`);

    // Score each gap using duration + text patterns
    const candidates: CandidateBoundary[] = [];
    for (const gap of gaps) {
      const gapScore = scoreGap(gap.duration);
      const textScore = scoreTextPatterns(cues, gap.gapStart, gap.gapEnd);

      const totalScore = gapScore.score + textScore.score;
      const reasons: string[] = [];
      if (gapScore.reason) reasons.push(gapScore.reason);
      reasons.push(...textScore.reasons);

      if (totalScore >= 3) {
        candidates.push({
          gapStart: gap.gapStart,
          gapEnd: gap.gapEnd,
          gapDuration: gap.duration,
          score: totalScore,
          reasons,
        });
      }
    }

    // Deduplicate boundaries within 2 minutes of each other
    const boundaries = dedup(candidates, 120);

    console.log(`\nFound ${boundaries.length} boundary candidate(s):`);
    for (const b of boundaries) {
      console.log(
        `  ${formatTime(b.gapStart)} → ${formatTime(b.gapEnd)} ` +
          `(score=${b.score}: ${b.reasons.join(", ")})`
      );
    }

    if (boundaries.length === 0) {
      throw new Error(
        "No talk boundaries detected. The stream may be continuous without breaks."
      );
    }

    // Build talk boundaries from detected gaps
    const talks: TalkBoundary[] = [];
    const streamStart = cues[0].startTime;
    const streamEnd = ctx.metadata.duration;

    for (let i = 0; i <= boundaries.length; i++) {
      const talkStart = i === 0 ? streamStart : boundaries[i - 1].gapEnd;
      const talkEnd = i === boundaries.length ? streamEnd : boundaries[i].gapStart;

      // Skip very short segments (< 60s) — likely noise
      if (talkEnd - talkStart < 60) continue;

      const startIdx = cues.findIndex((c) => c.startTime >= talkStart);
      if (startIdx === -1) continue;

      talks.push({
        title: extractTitle(cues, startIdx, talks.length),
        speaker: extractSpeaker(cues, startIdx),
        startTime: talkStart,
        endTime: talkEnd,
      });
    }

    console.log(`\nDetected ${talks.length} talks from combined gap + text analysis.`);
    for (const talk of talks) {
      console.log(
        `  ${formatTime(talk.startTime)} → ${formatTime(talk.endTime)} | ${talk.speaker} — ${talk.title}`
      );
    }

    return talks;
  },
};
