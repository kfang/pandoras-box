import { Command } from "commander";
import { $ } from "bun";
import { buildConfig } from "./config";
import { runPipeline } from "./pipeline";

const program = new Command()
  .name("thoth")
  .description(
    "Scan manga/light novel archives and inject metadata from AniList for Calibre import."
  )
  .version("0.1.0")
  .argument("<path>", "File or directory to process")
  .option("-r, --recursive", "Scan recursively", true)
  .option("-n, --dry-run", "Preview changes without writing", false)
  .option("-f, --format <type>", 'Only process "cbz" or "epub"')
  .option("--cache <path>", "Cache file path")
  .option("--no-interactive", "Skip prompts, only process high-confidence matches")
  .option("--clear-cache", "Clear cache before running", false);

program.action(async (targetPath: string, opts: Record<string, any>) => {
  // Check for system zip command
  const zipCheck = await $`which zip`.quiet().nothrow();
  if (zipCheck.exitCode !== 0) {
    console.error("Error: 'zip' command not found. Please install it.");
    process.exit(1);
  }

  try {
    const config = buildConfig({
      path: targetPath,
      recursive: opts.recursive,
      dryRun: opts.dryRun,
      format: opts.format,
      cache: opts.cache,
      interactive: opts.interactive,
      clearCache: opts.clearCache,
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
