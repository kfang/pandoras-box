import fs from "fs";
import path from "path";
import type { Config } from "./config";
import type { ParsedFile, VolumeMetadata } from "./types";
import { parseFilename, groupBySeries } from "./parser/filename";
import { AniListProvider } from "./providers/anilist";
import { CachedProvider } from "./providers/cache";
import { matchSeries } from "./match/matcher";
import { ComicInfoWriter } from "./writers/comicinfo";
import { OpfWriter } from "./writers/opf";
import { closePrompt } from "./utils/prompt";

function scanFiles(dir: string, recursive: boolean): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      files.push(...scanFiles(fullPath, recursive));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === ".cbz" || ext === ".epub") {
        files.push(fullPath);
      }
    }
  }

  return files.sort();
}

export async function runPipeline(config: Config): Promise<void> {
  const provider = new CachedProvider(new AniListProvider(), config.cache);

  if (config.clearCache) {
    provider.clear();
    console.error("Cache cleared.");
  }

  // Step 1: Scan
  const stat = fs.statSync(config.path);
  let filePaths: string[];

  if (stat.isFile()) {
    filePaths = [config.path];
  } else {
    filePaths = scanFiles(config.path, config.recursive);
  }

  if (config.format) {
    filePaths = filePaths.filter(
      (f) => path.extname(f).toLowerCase().slice(1) === config.format
    );
  }

  console.error(`Found ${filePaths.length} files to process.`);

  // Step 2: Parse filenames
  const parsed: ParsedFile[] = [];
  const failed: string[] = [];

  for (const fp of filePaths) {
    const result = parseFilename(fp);
    if (result) {
      parsed.push(result);
    } else {
      failed.push(fp);
    }
  }

  if (failed.length > 0) {
    console.error(`\nCould not parse ${failed.length} filenames:`);
    for (const f of failed) {
      console.error(`  - ${path.basename(f)}`);
    }
  }

  // Step 3: Group by series
  const groups = groupBySeries(parsed);
  console.error(`\nIdentified ${groups.size} series:\n`);

  for (const [name, files] of groups) {
    const formats = [...new Set(files.map((f) => f.format))].join(", ");
    console.error(`  ${name} (${files.length} files, ${formats})`);
  }

  // Step 4: Match each series
  console.error("\nMatching series...\n");

  const comicInfoWriter = new ComicInfoWriter();
  const opfWriter = new OpfWriter();
  let processed = 0;
  let skipped = 0;

  try {
    for (const [seriesName, files] of groups) {
      const format = files[0].format;
      const match = await matchSeries(
        seriesName,
        format,
        provider,
        config.interactive
      );

      if (!match) {
        console.error(`  ✗ Skipped "${seriesName}" (no match)\n`);
        skipped += files.length;
        continue;
      }

      // Step 5: Write metadata for each file in the group
      for (const file of files.sort((a, b) => a.volume - b.volume)) {
        const volumeMeta: VolumeMetadata = {
          parsed: file,
          series: match.series,
        };

        const writer = file.format === "cbz" ? comicInfoWriter : opfWriter;
        await writer.write(volumeMeta, config.dryRun);
        processed++;
      }
    }
  } finally {
    provider.save();
    closePrompt();
  }

  console.error(
    `\nDone. Processed: ${processed}, Skipped: ${skipped}, Failed to parse: ${failed.length}`
  );
}
