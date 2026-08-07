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
  mappings: Record<string, string | number>; // seriesName -> provider ID (confirmed)
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

  getConfirmedMapping(seriesName: string): string | number | undefined {
    return this.cache.mappings[seriesName];
  }

  setConfirmedMapping(seriesName: string, seriesId: string | number): void {
    this.cache.mappings[seriesName] = seriesId;
    this.dirty = true;
  }

  // Stores a manually-entered series directly in the cache (bypassing the
  // inner provider, which has never heard of it) and confirms the mapping so
  // later runs resolve it via getSeriesById without re-prompting.
  setManualSeries(seriesName: string, series: SeriesMetadata): void {
    this.cache.series[String(series.id)] = { data: series, timestamp: Date.now() };
    this.cache.mappings[seriesName] = series.id;
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

  async getSeriesById(id: string | number): Promise<SeriesMetadata | null> {
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

  get supportsPerVolume(): boolean {
    return typeof this.inner.getVolume === "function";
  }

  async getVolume(
    seriesId: string | number,
    volumeNumber: number
  ): Promise<SeriesMetadata | null> {
    if (!this.inner.getVolume) return null;

    const key = `vol:${seriesId}:${volumeNumber}`;
    const cached = this.cache.series[key];
    if (this.isValid(cached)) return cached.data;

    const result = await this.inner.getVolume(seriesId, volumeNumber);
    if (result) {
      this.cache.series[key] = { data: result, timestamp: Date.now() };
      this.dirty = true;
    }
    return result;
  }
}
