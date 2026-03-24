import type { NabuConfig, PipelineContext } from "../types";
import { fetchMetadata, downloadVideo } from "./video";
import { downloadSubtitles, transcribeWithWhisper } from "./subtitles";
import { mkdir } from "node:fs/promises";

export async function download(config: NabuConfig): Promise<PipelineContext> {
  await mkdir(config.outputDir, { recursive: true });

  const metadata = await fetchMetadata(config.url);
  console.log(`Video: "${metadata.title}" (${Math.round(metadata.duration)}s)`);

  const videoPath = await downloadVideo(config.url, config.outputDir);
  console.log(`Video saved to: ${videoPath}`);

  const lang = "en";
  let subtitlePath = await downloadSubtitles(config.url, config.outputDir, lang);

  if (!subtitlePath) {
    console.log("Falling back to Whisper transcription...");
    try {
      subtitlePath = await transcribeWithWhisper(videoPath, config.outputDir, lang);
    } catch (err) {
      console.warn(
        `Whisper transcription failed: ${err instanceof Error ? err.message : err}`
      );
      console.warn("Continuing without subtitles.");
    }
  }

  return {
    config,
    videoPath,
    subtitlePath: subtitlePath ?? undefined,
    subtitleLang: lang,
    metadata,
    workDir: config.outputDir,
  };
}
