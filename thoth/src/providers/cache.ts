import fs from "fs";
import type { SeriesMetadata } from "../types";
import type { MetadataProvider, SearchOptions } from "./types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface CacheData {
  searches: Record<string, CacheEntry<SeriesMetadata[]>>;
  series: Record<string, CacheEntry<SeriesMetadata>>;
  mappings: Record<string, number>; // seriesName -> anilist ID (confirmed)
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class CachedProvider implements MetadataProvider {
  private cache: CacheData;
  private dirty = false;

  constructor(
    private inner: MetadataProvider,
    private cachePath: string
  ) {
    this.cache = this.load();
  }

  private load(): CacheData {
    try {
      const raw = fs.readFileSync(this.cachePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return { searches: {}, series: {}, mappings: {} };
    }
  }

  save(): void {
    if (!this.dirty) return;
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
    this.dirty = false;
  }

  clear(): void {
    this.cache = { searches: {}, series: {}, mappings: {} };
    this.dirty = true;
    this.save();
  }

  private isValid<T>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> {
    return !!entry && Date.now() - entry.timestamp < TTL_MS;
  }

  getConfirmedMapping(seriesName: string): number | undefined {
    return this.cache.mappings[seriesName];
  }

  setConfirmedMapping(seriesName: string, anilistId: number): void {
    this.cache.mappings[seriesName] = anilistId;
    this.dirty = true;
  }

  async searchSeries(
    query: string,
    opts?: SearchOptions
  ): Promise<SeriesMetadata[]> {
    const key = `${query}|${opts?.format ?? ""}`;
    const cached = this.cache.searches[key];
    if (this.isValid(cached)) return cached.data;

    const results = await this.inner.searchSeries(query, opts);
    this.cache.searches[key] = { data: results, timestamp: Date.now() };
    this.dirty = true;
    return results;
  }

  async getSeriesById(id: number): Promise<SeriesMetadata | null> {
    const key = String(id);
    const cached = this.cache.series[key];
    if (this.isValid(cached)) return cached.data;

    const result = await this.inner.getSeriesById(id);
    if (result) {
      this.cache.series[key] = { data: result, timestamp: Date.now() };
      this.dirty = true;
    }
    return result;
  }
}
