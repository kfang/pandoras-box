import fs from "fs";
import path from "path";
import type { Config } from "./config";
import type {
  ParsedFile,
  VolumeMetadata,
  MatchResult,
  FileFormat,
} from "./types";
import { parseFilename, groupBySeries } from "./parser/filename";
import { AniListProvider } from "./providers/anilist";
import { ComicVineProvider } from "./providers/comicvine";
import { RanobeDbProvider } from "./providers/ranobedb";
import { YamlProvider } from "./providers/yaml";
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

interface NamedProvider {
  name: string;
  provider: CachedProvider;
}

// Each provider gets its own cache file: ids/URLs are not comparable across
// providers, and separate files avoid two CachedProvider instances clobbering
// each other's writes to a shared file.
function cachePathFor(base: string, provider: string): string {
  const dir = path.dirname(base);
  const ext = path.extname(base);
  const name = path.basename(base, ext);
  return path.join(dir, `${name}-${provider}${ext}`);
}

interface Providers {
  yaml?: NamedProvider;
  comicvine?: NamedProvider;
  ranobedb: NamedProvider;
  anilist: NamedProvider;
}

// Build all available providers. ComicVine needs an API key — without it, it is
// skipped. RanobeDB and AniList need no key. Yaml is enabled by passing
// --yaml-dir.
function buildProviders(config: Config): Providers {
  let yaml: NamedProvider | undefined;
  if (config.yamlDir) {
    yaml = {
      name: "yaml",
      provider: new CachedProvider(
        new YamlProvider(config.yamlDir),
        cachePathFor(config.cache, "yaml")
      ),
    };
  }

  const apiKey = process.env.COMICVINE_API_KEY;
  let comicvine: NamedProvider | undefined;
  if (apiKey) {
    comicvine = {
      name: "comicvine",
      provider: new CachedProvider(
        new ComicVineProvider(apiKey),
        cachePathFor(config.cache, "comicvine")
      ),
    };
  } else {
    console.error("COMICVINE_API_KEY not set — ComicVine disabled.");
  }

  return {
    yaml,
    comicvine,
    ranobedb: {
      name: "ranobedb",
      provider: new CachedProvider(
        new RanobeDbProvider(),
        cachePathFor(config.cache, "ranobedb")
      ),
    },
    anilist: {
      name: "anilist",
      provider: new CachedProvider(
        new AniListProvider(),
        cachePathFor(config.cache, "anilist")
      ),
    },
  };
}

// Provider order depends on format: EPUB (light novels) starts with RanobeDB;
// everything else (CBZ) starts with ComicVine. AniList is the final fallback.
// Yaml, when configured, always goes first regardless of format.
function orderFor(format: FileFormat, p: Providers): NamedProvider[] {
  const chain =
    format === "epub"
      ? [p.yaml, p.ranobedb, p.comicvine, p.anilist]
      : [p.yaml, p.comicvine, p.ranobedb, p.anilist];
  return chain.filter((x): x is NamedProvider => x !== undefined);
}

export async function runPipeline(config: Config): Promise<void> {
  const providers = buildProviders(config);
  const allProviders = [
    providers.yaml,
    providers.comicvine,
    providers.ranobedb,
    providers.anilist,
  ].filter((x): x is NamedProvider => x !== undefined);
  console.error(
    "Provider order — epub: " +
      orderFor("epub", providers)
        .map((p) => p.name)
        .join(" → ") +
      "; cbz: " +
      orderFor("cbz", providers)
        .map((p) => p.name)
        .join(" → ")
  );

  if (config.clearCache) {
    for (const { provider } of allProviders) provider.clear();
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
      const chain = orderFor(format, providers);

      // Try each provider in the format-specific order; the first to return a
      // match wins, and drives per-volume resolution below. A provider that
      // throws (e.g. API error / rate limit) is treated as "not found" so we
      // fall back to the next provider rather than aborting the run.
      let match: MatchResult | null = null;
      let chosen: CachedProvider | null = null;
      let chosenName = "";
      for (const p of chain) {
        try {
          match = await matchSeries(
            seriesName,
            format,
            p.provider,
            config.interactive
          );
        } catch (err) {
          console.error(
            `  ! ${p.name} lookup failed for "${seriesName}": ${err instanceof Error ? err.message : err}`
          );
          match = null;
        }
        if (match) {
          chosen = p.provider;
          chosenName = p.name;
          if (p !== chain[0]) {
            console.error(`    ↳ matched via ${p.name} fallback`);
          }
          break;
        }
      }

      if (!match || !chosen) {
        console.error(`  ✗ Skipped "${seriesName}" (no match)\n`);
        skipped += files.length;
        continue;
      }

      // Step 5: Write metadata for each file in the group
      for (const file of files.sort((a, b) => a.volume - b.volume)) {
        // Resolve per-volume metadata (e.g. the ComicVine issue for this
        // volume number) when the chosen provider supports it; fall back to
        // the series-level match on a miss or an error.
        let series = match.series;
        if (chosen.supportsPerVolume && series.provider !== "manual") {
          try {
            const vol = await chosen.getVolume(match.series.id, file.volume);
            if (vol) {
              series = vol;
            } else {
              console.error(
                `  ! No per-volume match for "${seriesName}" Vol. ${file.volume}; using series-level metadata`
              );
            }
          } catch (err) {
            console.error(
              `  ! ${chosenName} per-volume lookup failed for "${seriesName}" Vol. ${file.volume}: ${err instanceof Error ? err.message : err}; using series-level metadata`
            );
          }
        }

        const volumeMeta: VolumeMetadata = { parsed: file, series };

        const writer = file.format === "cbz" ? comicInfoWriter : opfWriter;
        try {
          await writer.write(volumeMeta, config.dryRun);
          processed++;
        } catch (err) {
          console.error(
            `  ✗ Failed to write ${file.fileName}: ${err instanceof Error ? err.message : err}`
          );
          skipped++;
        }
      }
    }
  } finally {
    for (const { provider } of allProviders) provider.save();
    closePrompt();
  }

  console.error(
    `\nDone. Processed: ${processed}, Skipped: ${skipped}, Failed to parse: ${failed.length}`
  );
}
