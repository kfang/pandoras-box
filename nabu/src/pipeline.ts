import type { NabuConfig, TalkBoundary } from "./types";
import { download } from "./download";
import { getStrategy, autoDetect } from "./strategies";
import { splitVideo } from "./split/video";
import { splitSubtitles } from "./split/subtitles";
import { formatDuration, formatTimestamp } from "./utils/time";
import { parseSrt, cleanAutoCaption, writeSrt } from "./subtitles";
import { join } from "node:path";

function validateBoundaries(
  boundaries: TalkBoundary[],
  duration: number
): void {
  for (const talk of boundaries) {
    if (talk.startTime < 0) {
      throw new Error(`Talk "${talk.title}" has negative start time.`);
    }
    if (talk.endTime > duration + 1) {
      throw new Error(
        `Talk "${talk.title}" end time (${talk.endTime}s) exceeds video duration (${duration}s).`
      );
    }
    if (talk.startTime >= talk.endTime) {
      throw new Error(
        `Talk "${talk.title}" has start time >= end time.`
      );
    }
  }

  // Check for overlaps
  const sorted = [...boundaries].sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime - 1) {
      throw new Error(
        `Overlapping talks: "${sorted[i - 1].title}" and "${sorted[i].title}".`
      );
    }
  }
}

function printBoundaries(boundaries: TalkBoundary[]): void {
  console.log("\n  #  | Start      | End        | Duration | Speaker          | Title");
  console.log("  ---+------------+------------+----------+------------------+------");
  for (let i = 0; i < boundaries.length; i++) {
    const t = boundaries[i];
    const dur = formatDuration(t.endTime - t.startTime);
    const num = (i + 1).toString().padStart(3);
    const start = formatTimestamp(t.startTime).slice(0, 8);
    const end = formatTimestamp(t.endTime).slice(0, 8);
    const speaker = t.speaker.padEnd(16).slice(0, 16);
    console.log(`  ${num} | ${start}   | ${end}   | ${dur.padEnd(8)} | ${speaker} | ${t.title}`);
  }
  console.log();
}

export async function runPipeline(config: NabuConfig): Promise<void> {
  // Step 1: Download
  console.log("\n=== Step 1: Download ===\n");
  const ctx = await download(config);

  // Step 1.5: Clean subtitles
  if (ctx.subtitlePath) {
    console.log("\n=== Step 1.5: Clean Subtitles ===\n");
    const rawContent = await Bun.file(ctx.subtitlePath).text();
    const rawCues = parseSrt(rawContent);
    const cleanedCues = cleanAutoCaption(rawCues);
    console.log(`Cleaned: ${rawCues.length} raw cues → ${cleanedCues.length} clean cues`);

    const cleanedPath = join(config.outputDir, "source.clean.en.srt");
    await Bun.write(cleanedPath, writeSrt(cleanedCues));
    console.log(`Saved cleaned subtitles: ${cleanedPath}`);
    ctx.subtitlePath = cleanedPath;
  }

  // Step 2: Analyze
  console.log("\n=== Step 2: Analyze ===");
  let boundaries: TalkBoundary[];

  if (config.strategy === "auto") {
    const result = await autoDetect(ctx);
    boundaries = result.boundaries;
  } else {
    const strategy = getStrategy(config.strategy);
    boundaries = await strategy.analyze(ctx);
  }

  // Validate
  validateBoundaries(boundaries, ctx.metadata.duration);

  // Print results
  console.log(`\nDetected ${boundaries.length} talks:`);
  printBoundaries(boundaries);

  if (config.dryRun) {
    console.log("Dry run — skipping split and tag steps.");
    return;
  }

  // Step 3: Split + Tag
  console.log("=== Step 3: Split + Tag ===\n");

  const talkDirs = await splitVideo(boundaries, {
    videoPath: ctx.videoPath,
    outputDir: config.outputDir,
    conferenceName: config.conferenceName,
    conferenceDate: config.conferenceDate,
  });

  // Step 4: Split subtitles
  if (ctx.subtitlePath) {
    console.log("\n=== Step 4: Split Subtitles ===\n");
    await splitSubtitles(
      ctx.subtitlePath,
      boundaries,
      config.outputDir,
      ctx.subtitleLang
    );
  }

  console.log(`\nDone! ${boundaries.length} talks saved to ${config.outputDir}`);
  console.log(`Original video: ${ctx.videoPath}`);
}
