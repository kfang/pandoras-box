import type { TalkBoundary } from "../types";
import { parseSrt, formatSrtTime, writeSrt, type SrtCue } from "../subtitles";
import { join } from "node:path";

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

export async function splitSubtitles(
  subtitlePath: string,
  talks: TalkBoundary[],
  outputDir: string,
  lang: string
): Promise<void> {
  const content = await Bun.file(subtitlePath).text();
  const allCues = parseSrt(content);

  if (allCues.length === 0) {
    console.warn("No subtitle cues found to split.");
    return;
  }

  for (let i = 0; i < talks.length; i++) {
    const talk = talks[i];
    const dirName = buildTalkDirName(i, talk);
    const talkDir = join(outputDir, dirName);

    // Filter cues that fall within this talk's time range
    const talkCues = allCues.filter(
      (cue) => cue.startTime >= talk.startTime && cue.startTime < talk.endTime
    );

    if (talkCues.length === 0) continue;

    // Re-time cues to start from 0
    const offset = talk.startTime;
    const retimedCues: SrtCue[] = talkCues.map((cue, idx) => ({
      index: idx + 1,
      startTime: cue.startTime - offset,
      endTime: Math.min(cue.endTime, talk.endTime) - offset,
      text: cue.text,
    }));

    const fileName = `${dirName}.${lang}.srt`;
    const outputPath = join(talkDir, fileName);
    await Bun.write(outputPath, writeSrt(retimedCues));
    console.log(`  Subtitles: ${fileName} (${retimedCues.length} cues)`);
  }
}
