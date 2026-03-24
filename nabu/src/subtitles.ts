/** Shared SRT parsing, cleaning, and writing utilities */

export interface SrtCue {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

/** Parse an SRT file into raw cues */
export function parseSrt(content: string): SrtCue[] {
  const cues: SrtCue[] = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    const index = parseInt(lines[0], 10);
    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!timeMatch) continue;

    const startTime =
      parseInt(timeMatch[1]) * 3600 +
      parseInt(timeMatch[2]) * 60 +
      parseInt(timeMatch[3]) +
      parseInt(timeMatch[4]) / 1000;

    const endTime =
      parseInt(timeMatch[5]) * 3600 +
      parseInt(timeMatch[6]) * 60 +
      parseInt(timeMatch[7]) +
      parseInt(timeMatch[8]) / 1000;

    const textLines = lines.slice(2).filter((l) => l.trim().length > 0);
    cues.push({ index, startTime, endTime, text: textLines.join("\n") });
  }

  return cues;
}

/**
 * Clean YouTube auto-generated captions.
 *
 * YouTube auto-captions use a progressive reveal system:
 * - Each cue shows up to 2 lines: line 1 is carried over, line 2 is new text
 * - 10ms "flash" cues (e.g., 00:40:53,109 --> 00:40:53,119) are transition frames
 * - A single cue can bridge a long gap (e.g., 1:43:03 --> 1:54:16) when
 *   the last text before a break gets an inflated end time
 *
 * This function:
 * 1. Drops flash cues (duration <= 20ms)
 * 2. Extracts only the new text (last line of multi-line cues)
 * 3. Deduplicates consecutive identical text
 * 4. Caps end times so no cue spans longer than maxCueDuration
 */
export function cleanAutoCaption(
  rawCues: SrtCue[],
  maxCueDuration: number = 10
): SrtCue[] {
  const cleaned: SrtCue[] = [];

  for (const cue of rawCues) {
    const duration = cue.endTime - cue.startTime;

    // Skip flash cues (10ms transitions)
    if (duration <= 0.02) continue;

    const lines = cue.text.split("\n").filter((l) => l.trim().length > 0);

    // Skip empty cues
    if (lines.length === 0) continue;

    // Extract new text: last line of multi-line cues, only line of single-line cues
    const newText = lines[lines.length - 1];

    // Deduplicate against last cleaned cue
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].text === newText) {
      cleaned[cleaned.length - 1].endTime = Math.min(
        cue.endTime,
        cleaned[cleaned.length - 1].startTime + maxCueDuration
      );
      continue;
    }

    // Cap end time to prevent cues spanning breaks
    const cappedEnd = Math.min(cue.endTime, cue.startTime + maxCueDuration);

    cleaned.push({
      index: cleaned.length + 1,
      startTime: cue.startTime,
      endTime: cappedEnd,
      text: newText,
    });
  }

  return cleaned;
}

/** Format seconds as SRT timestamp: HH:MM:SS,mmm */
export function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${ms.toString().padStart(3, "0")}`;
}

/** Write cues to SRT format string */
export function writeSrt(cues: SrtCue[]): string {
  return (
    cues
      .map(
        (cue, i) =>
          `${i + 1}\n${formatSrtTime(cue.startTime)} --> ${formatSrtTime(cue.endTime)}\n${cue.text}`
      )
      .join("\n\n") + "\n"
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
