import fs from "fs";
import path from "path";
import YAML from "yaml";
import type { SeriesMetadata, StaffMember } from "../types";
import type { MetadataProvider, SearchOptions } from "./types";

interface YamlTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

// A single entry under a series file's `volumes:` list. Any field left unset
// falls back to the series-level value (see mergeVolume below).
interface YamlVolumeFile {
  volume: number;
  title?: YamlTitle;
  description?: string;
  genres?: string[];
  tags?: string[];
  startDate?: { year?: number; month?: number; day?: number };
  staff?: StaffMember[];
  coverImage?: string;
  siteUrl?: string;
  publisher?: string;
}

// Shape of a single per-series YAML file. All fields are optional except the
// filename itself, which becomes the series id (see slugify below).
interface YamlSeriesFile {
  title?: YamlTitle;
  description?: string;
  genres?: string[];
  tags?: string[];
  startDate?: { year?: number; month?: number; day?: number };
  staff?: StaffMember[];
  coverImage?: string;
  siteUrl?: string;
  format?: string;
  publisher?: string;
  volumes?: YamlVolumeFile[];
}

interface Entry {
  series: SeriesMetadata;
  volumes: Map<number, YamlVolumeFile>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSeriesMetadata(slug: string, y: YamlSeriesFile): SeriesMetadata {
  return {
    id: slug,
    title: {
      romaji: y.title?.romaji,
      english: y.title?.english,
      native: y.title?.native,
    },
    description: y.description,
    genres: y.genres ?? [],
    tags: y.tags ?? [],
    startDate: y.startDate,
    staff: y.staff ?? [],
    coverImage: y.coverImage,
    siteUrl: y.siteUrl,
    format: y.format,
    publisher: y.publisher,
    provider: "yaml",
  };
}

// Overlays a volume's fields onto the series-level metadata; unset volume
// fields (including individual title variants) keep the series-level value.
function mergeVolume(series: SeriesMetadata, v: YamlVolumeFile): SeriesMetadata {
  return {
    ...series,
    title: {
      romaji: v.title?.romaji ?? series.title.romaji,
      english: v.title?.english ?? series.title.english,
      native: v.title?.native ?? series.title.native,
    },
    description: v.description ?? series.description,
    genres: v.genres ?? series.genres,
    tags: v.tags ?? series.tags,
    startDate: v.startDate ?? series.startDate,
    staff: v.staff ?? series.staff,
    coverImage: v.coverImage ?? series.coverImage,
    siteUrl: v.siteUrl ?? series.siteUrl,
    publisher: v.publisher ?? series.publisher,
  };
}

// Reads one YAML file per series from a directory. The series id is the
// slugified filename, so entries are stable across runs regardless of file
// order. A file may optionally list `volumes:`, each keyed by volume number,
// to override series-level fields (e.g. description, cover) for that volume;
// volumes without an entry fall back to series-level metadata.
export class YamlProvider implements MetadataProvider {
  private entries = new Map<string, Entry>();

  constructor(dir: string) {
    const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f));
    for (const file of files) {
      const slug = slugify(path.basename(file, path.extname(file)));
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const parsed = (YAML.parse(raw) ?? {}) as YamlSeriesFile;

      const volumes = new Map<number, YamlVolumeFile>();
      for (const v of parsed.volumes ?? []) {
        if (typeof v.volume === "number") volumes.set(v.volume, v);
      }

      this.entries.set(slug, { series: toSeriesMetadata(slug, parsed), volumes });
    }
  }

  async searchSeries(
    query: string,
    _opts?: SearchOptions
  ): Promise<SeriesMetadata[]> {
    const nq = normalize(query);
    if (!nq) return [];

    const results: SeriesMetadata[] = [];
    for (const [slug, entry] of this.entries) {
      const series = entry.series;
      const titles = [
        series.title.romaji,
        series.title.english,
        series.title.native,
        slug,
      ].filter(Boolean) as string[];

      const isMatch = titles.some((t) => {
        const nt = normalize(t);
        return nt.includes(nq) || nq.includes(nt);
      });
      if (isMatch) results.push(series);
    }
    return results;
  }

  async getSeriesById(id: string | number): Promise<SeriesMetadata | null> {
    return this.entries.get(String(id))?.series ?? null;
  }

  async getVolume(
    seriesId: string | number,
    volumeNumber: number
  ): Promise<SeriesMetadata | null> {
    const entry = this.entries.get(String(seriesId));
    if (!entry) return null;

    const override = entry.volumes.get(volumeNumber);
    return override ? mergeVolume(entry.series, override) : null;
  }
}
