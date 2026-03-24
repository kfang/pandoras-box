import { run, runWithProgress } from "../utils/subprocess";
import type { VideoMetadata } from "../types";

const YT_DLP_BASE = ["yt-dlp", "--js-runtimes", "bun", "--remote-components", "ejs:github"];

/** Fetch video metadata without downloading */
export async function fetchMetadata(url: string): Promise<VideoMetadata> {
  console.log("Fetching video metadata...");
  const result = await run([...YT_DLP_BASE, "--dump-json", "--no-download", url]);
  const json = JSON.parse(result.stdout);

  const subtitles = Object.keys(json.subtitles ?? {}).concat(
    Object.keys(json.automatic_captions ?? {})
  );

  return {
    title: json.title ?? "Unknown",
    duration: json.duration ?? 0,
    subtitles,
  };
}

/** Download the video file. Returns path to downloaded file. Skips if already present. */
export async function downloadVideo(
  url: string,
  outputDir: string
): Promise<string> {
  // Check if already downloaded
  const existing = await findSourceVideo(outputDir);
  if (existing) {
    console.log(`Video already downloaded: ${existing}`);
    return existing;
  }

  const outputTemplate = `${outputDir}/source.%(ext)s`;
  console.log("Downloading video...");

  const exitCode = await runWithProgress([
    ...YT_DLP_BASE,
    "-f",
    "bestvideo+bestaudio/best",
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    url,
  ]);

  if (exitCode !== 0) {
    throw new Error(`yt-dlp download failed with exit code ${exitCode}`);
  }

  const downloaded = await findSourceVideo(outputDir);
  if (downloaded) return downloaded;

  throw new Error("Downloaded video file not found");
}

async function findSourceVideo(dir: string): Promise<string | null> {
  const glob = new Bun.Glob("source.{mp4,mkv,webm,mov}");
  for await (const file of glob.scan(dir)) {
    return `${dir}/${file}`;
  }
  return null;
}
