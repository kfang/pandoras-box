import { run } from "../utils/subprocess";
import { formatTimestamp } from "../utils/time";
import type { TalkBoundary } from "../types";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

interface SplitOptions {
  videoPath: string;
  outputDir: string;
  conferenceName?: string;
  conferenceDate?: string;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTalkDirName(index: number, talk: TalkBoundary): string {
  const num = (index + 1).toString().padStart(2, "0");
  const parts = [num];
  if (talk.speaker !== "Unknown") parts.push(talk.speaker);
  parts.push(talk.title);
  return sanitizeFilename(parts.join(" - "));
}

export async function splitVideo(
  talks: TalkBoundary[],
  opts: SplitOptions
): Promise<string[]> {
  const outputPaths: string[] = [];

  for (let i = 0; i < talks.length; i++) {
    const talk = talks[i];
    const dirName = buildTalkDirName(i, talk);
    const talkDir = join(opts.outputDir, dirName);
    await mkdir(talkDir, { recursive: true });

    const fileName = `${dirName}.mp4`;
    const outputPath = join(talkDir, fileName);

    console.log(
      `\nSplitting [${i + 1}/${talks.length}]: ${talk.title} (${formatTimestamp(talk.startTime)} → ${formatTimestamp(talk.endTime)})`
    );

    const args = [
      "ffmpeg",
      "-y",
      "-ss",
      formatTimestamp(talk.startTime),
      "-to",
      formatTimestamp(talk.endTime),
      "-i",
      opts.videoPath,
      "-c",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
    ];

    // Add metadata
    args.push("-metadata", `title=${talk.title}`);
    if (talk.speaker !== "Unknown") {
      args.push("-metadata", `artist=${talk.speaker}`);
    }
    if (opts.conferenceName) {
      args.push("-metadata", `album=${opts.conferenceName}`);
    }
    if (opts.conferenceDate) {
      args.push("-metadata", `date=${opts.conferenceDate}`);
    }
    if (talk.description) {
      args.push("-metadata", `comment=${talk.description}`);
    }
    args.push("-metadata", `track=${i + 1}/${talks.length}`);

    args.push(outputPath);

    await run(args);
    outputPaths.push(talkDir);
    console.log(`  Saved: ${outputPath}`);
  }

  return outputPaths;
}
