import type { SeriesMetadata } from "../types";

export interface SearchOptions {
  format?: "MANGA" | "NOVEL";
}

export interface MetadataProvider {
  searchSeries(query: string, opts?: SearchOptions): Promise<SeriesMetadata[]>;
  getSeriesById(id: number): Promise<SeriesMetadata | null>;
}
