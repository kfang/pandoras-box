import type { SeriesMetadata } from "../types";

export interface SearchOptions {
  format?: "MANGA" | "NOVEL";
}

export interface MetadataProvider {
  searchSeries(query: string, opts?: SearchOptions): Promise<SeriesMetadata[]>;
  getSeriesById(id: string | number): Promise<SeriesMetadata | null>;
  // Optional per-volume resolution: given a matched series id and a volume
  // number, return metadata specific to that volume (e.g. a ComicVine issue).
  // Providers without a per-volume concept (AniList, Yaml) omit this.
  getVolume?(
    seriesId: string | number,
    volumeNumber: number
  ): Promise<SeriesMetadata | null>;
}
