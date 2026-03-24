import { run, runWithProgress, commandExists } from "../utils/subprocess";

const YT_DLP_BASE = ["yt-dlp", "--js-runtimes", "bun", "--remote-components", "ejs:github"];

/** Try to download subtitles from YouTube. Returns SRT path or null. Skips if already present. */
export async function downloadSubtitles(
  url: string,
  outputDir: string,
  lang: string = "en"
): Promise<string | null> {
  // Check if already downloaded
  const existing = await findSubtitleFile(outputDir, lang);
  if (existing) {
    console.log(`Subtitles already downloaded: ${existing}`);
    return existing;
  }

  console.log(`Attempting to download ${lang} subtitles...`);

  const result = await run(
    [
      ...YT_DLP_BASE,
      "--write-auto-sub",
      "--write-sub",
      "--sub-lang",
      lang,
      "--convert-subs",
      "srt",
      "--skip-download",
      "-o",
      `${outputDir}/source`,
      url,
    ],
    { quiet: true }
  );

  // Look for the downloaded subtitle file
  const glob = new Bun.Glob(`source.${lang}*.srt`);
  for await (const file of glob.scan(outputDir)) {
    console.log(`Downloaded subtitles: ${file}`);
    return `${outputDir}/${file}`;
  }

  // Also check without lang prefix (yt-dlp naming can vary)
  const glob2 = new Bun.Glob("source*.srt");
  for await (const file of glob2.scan(outputDir)) {
    console.log(`Downloaded subtitles: ${file}`);
    return `${outputDir}/${file}`;
  }

  console.log("No subtitles found on YouTube.");
  return null;
}

/** Use Whisper to transcribe audio. Returns SRT path. */
export async function transcribeWithWhisper(
  videoPath: string,
  outputDir: string,
  lang: string = "en"
): Promise<string> {
  if (!(await commandExists("whisper"))) {
    throw new Error(
      "whisper is not installed. Cannot transcribe without subtitles."
    );
  }

  console.log("Extracting audio for Whisper transcription...");
  const audioPath = `${outputDir}/audio.wav`;
  await run([
    "ffmpeg",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    audioPath,
  ]);

  console.log("Running Whisper transcription (this may take a while)...");
  const exitCode = await runWithProgress([
    "whisper",
    audioPath,
    "--language",
    lang,
    "--output_format",
    "srt",
    "--output_dir",
    outputDir,
  ]);

  if (exitCode !== 0) {
    throw new Error(`Whisper transcription failed with exit code ${exitCode}`);
  }

  const srtPath = `${outputDir}/audio.srt`;
  const file = Bun.file(srtPath);
  if (await file.exists()) {
    return srtPath;
  }

  throw new Error("Whisper output SRT file not found");
}

async function findSubtitleFile(dir: string, lang: string): Promise<string | null> {
  for (const pattern of [`source.${lang}*.srt`, `source*.srt`, `audio.srt`]) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan(dir)) {
      return `${dir}/${file}`;
    }
  }
  return null;
}
