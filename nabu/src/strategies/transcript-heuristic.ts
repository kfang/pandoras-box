import type { Strategy, PipelineContext, TalkBoundary } from "../types";
import { parseSrt, type SrtCue } from "../subtitles";

interface ScoredGap {
  gapStart: number;
  gapEnd: number;
  duration: number;
  score: number;
  reasons: string[];
}

interface BoundaryCluster {
  talkEnd: number;   // before first gap in cluster
  talkStart: number; // after last gap in cluster
  totalBreak: number;
  maxScore: number;
  reasons: string[];
}

function scoreGap(duration: number): { score: number; reason: string } {
  if (duration >= 90) return { score: 5, reason: `long gap (${Math.round(duration)}s)` };
  if (duration >= 30) return { score: 3, reason: `medium gap (${Math.round(duration)}s)` };
  if (duration >= 15) return { score: 2, reason: `short gap (${Math.round(duration)}s)` };
  if (duration >= 8) return { score: 1, reason: `brief gap (${Math.round(duration)}s)` };
  return { score: 0, reason: "" };
}

function scoreTextPatterns(
  cues: SrtCue[],
  gapStartTime: number,
  gapEndTime: number
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const beforeText = cues
    .filter((c) => c.startTime >= gapStartTime - 60 && c.startTime <= gapStartTime)
    .map((c) => c.text)
    .join(" ")
    .toLowerCase();

  const afterText = cues
    .filter((c) => c.startTime >= gapEndTime && c.startTime <= gapEndTime + 60)
    .map((c) => c.text)
    .join(" ")
    .toLowerCase();

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

function findGaps(cues: SrtCue[], minGap: number): ScoredGap[] {
  const gaps: ScoredGap[] = [];
  for (let i = 1; i < cues.length; i++) {
    const duration = cues[i].startTime - cues[i - 1].endTime;
    if (duration >= minGap) {
      const gapScore = scoreGap(duration);
      const textScore = scoreTextPatterns(cues, cues[i - 1].endTime, cues[i].startTime);
      const totalScore = gapScore.score + textScore.score;
      const reasons: string[] = [];
      if (gapScore.reason) reasons.push(gapScore.reason);
      reasons.push(...textScore.reasons);

      gaps.push({
        gapStart: cues[i - 1].endTime,
        gapEnd: cues[i].startTime,
        duration,
        score: totalScore,
        reasons,
      });
    }
  }
  return gaps;
}

/**
 * Cluster consecutive gaps where the next gap starts within `windowSec` of
 * the previous gap's end. This correctly merges multi-phase transitions
 * (e.g. end-of-talk gap + soundcheck gap + setup gap) into one boundary.
 */
function clusterGaps(gaps: ScoredGap[], windowSec: number): BoundaryCluster[] {
  if (gaps.length === 0) return [];

  const clusters: BoundaryCluster[] = [];
  let clusterGaps = [gaps[0]];

  for (let i = 1; i < gaps.length; i++) {
    const last = clusterGaps[clusterGaps.length - 1];
    if (gaps[i].gapStart - last.gapEnd < windowSec) {
      clusterGaps.push(gaps[i]);
    } else {
      clusters.push(makeCluster(clusterGaps));
      clusterGaps = [gaps[i]];
    }
  }
  clusters.push(makeCluster(clusterGaps));
  return clusters;
}

function makeCluster(gaps: ScoredGap[]): BoundaryCluster {
  const maxScore = Math.max(...gaps.map((g) => g.score));
  const allReasons = [...new Set(gaps.flatMap((g) => g.reasons))];
  return {
    talkEnd: gaps[0].gapStart,
    talkStart: gaps[gaps.length - 1].gapEnd,
    totalBreak: gaps[gaps.length - 1].gapEnd - gaps[0].gapStart,
    maxScore,
    reasons: allReasons,
  };
}

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

    // Find all scored gaps >= 8s
    const scoredGaps = findGaps(cues, 8);
    console.log(`Found ${scoredGaps.length} gaps >= 8s`);

    // Only consider gaps that scored at least 1 (have some signal)
    const candidateGaps = scoredGaps.filter((g) => g.score >= 1);

    // Cluster consecutive gaps where the next gap starts within 10 min of the
    // previous gap's end. This merges multi-phase transitions into one boundary.
    const CLUSTER_WINDOW = 10 * 60;
    const clusters = clusterGaps(candidateGaps, CLUSTER_WINDOW);
    console.log(`Clustered into ${clusters.length} boundary candidate(s)`);

    // Keep clusters where at least one gap scored >= 3
    const boundaries = clusters.filter((c) => c.maxScore >= 3);

    console.log(`\nFound ${boundaries.length} boundary candidate(s):`);
    for (const b of boundaries) {
      console.log(
        `  ${formatTime(b.talkEnd)} → ${formatTime(b.talkStart)} ` +
          `(break=${Math.round(b.totalBreak)}s, maxScore=${b.maxScore}: ${b.reasons.join(", ")})`
      );
    }

    if (boundaries.length === 0) {
      throw new Error(
        "No talk boundaries detected. The stream may be continuous without breaks."
      );
    }

    // Build talk list from boundaries
    const talks: TalkBoundary[] = [];
    const streamStart = cues[0].startTime;
    const streamEnd = ctx.metadata.duration;

    for (let i = 0; i <= boundaries.length; i++) {
      const talkStart = i === 0 ? streamStart : boundaries[i - 1].talkStart;
      const talkEnd = i === boundaries.length ? streamEnd : boundaries[i].talkEnd;

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

    console.log(`\nDetected ${talks.length} talks from gap cluster analysis.`);
    for (const talk of talks) {
      console.log(
        `  ${formatTime(talk.startTime)} → ${formatTime(talk.endTime)} | ${talk.speaker} — ${talk.title}`
      );
    }

    return talks;
  },
};
