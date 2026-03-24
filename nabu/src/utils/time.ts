/** Parse "HH:MM:SS" or "MM:SS" or seconds number into total seconds */
export function parseTimestamp(input: string | number): number {
  if (typeof input === "number") return input;
  const parts = input.split(":").map(Number);
  if (parts.some(isNaN)) throw new Error(`Invalid timestamp: ${input}`);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  throw new Error(`Invalid timestamp format: ${input}`);
}

/** Format seconds into "HH:MM:SS.mmm" for ffmpeg */
export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const sWhole = Math.floor(s);
  const ms = Math.round((s - sWhole) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sWhole)}.${ms.toString().padStart(3, "0")}`;
}

/** Format seconds into human-readable "1h 23m 45s" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ");
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
