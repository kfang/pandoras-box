import { Command } from "commander";
import { buildConfig } from "./config";
import { runPipeline } from "./pipeline";
import { commandExists } from "./utils/subprocess";

const program = new Command()
  .name("nabu")
  .description(
    "Download conference livestream videos from YouTube, split them into individual talks, and add metadata."
  )
  .version("0.1.0")
  .argument("<youtube-url>", "YouTube video URL")
  .option(
    "-s, --strategy <name>",
    "splitting strategy: auto, transcript, manual",
    "auto"
  )
  .option("-o, --output <dir>", "output directory", "/output")
  .option("--conference <name>", "conference name for metadata")
  .option("--date <date>", "conference date for metadata")
  .option(
    "--manual-file <file>",
    "JSON file with talk boundaries (for manual strategy)"
  )
  .option(
    "--dry-run",
    "show detected boundaries without splitting",
    false
  );

program.action(async (url: string, opts: Record<string, any>) => {
  // Check prerequisites
  const missing: string[] = [];
  if (!(await commandExists("yt-dlp"))) missing.push("yt-dlp");
  if (!(await commandExists("ffmpeg"))) missing.push("ffmpeg");

  if (missing.length > 0) {
    console.error(
      `Error: Missing required tools: ${missing.join(", ")}\nPlease install them or use the Docker image.`
    );
    process.exit(1);
  }

  try {
    const config = buildConfig({
      url,
      strategy: opts.strategy,
      output: opts.output,
      conference: opts.conference,
      date: opts.date,
      manualFile: opts.manualFile,
      dryRun: opts.dryRun,
    });

    await runPipeline(config);
  } catch (err) {
    console.error(
      `\nError: ${err instanceof Error ? err.message : err}`
    );
    process.exit(1);
  }
});

program.parse();
