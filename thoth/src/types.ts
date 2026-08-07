export type FileFormat = "cbz" | "epub";

export interface ParsedFile {
  filePath: string;
  fileName: string;
  format: FileFormat;
  seriesName: string;
  subSeries?: string;
  volume: number;
  publisher?: string;
  group?: string;
  year?: number;
  chapters?: string;
}

export interface SeriesGroup {
  seriesName: string;
  format: FileFormat;
  files: ParsedFile[];
}

export interface SeriesMetadata {
  id: string | number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  description?: string;
  genres: string[];
  tags: string[];
  startDate?: { year?: number; month?: number; day?: number };
  staff: StaffMember[];
  coverImage?: string;
  siteUrl?: string;
  format?: string;
  comicvineId?: string; // ComicVine resource id incl. type prefix, e.g. "4050-12345"
  ranobedbId?: string; // RanobeDB book id, e.g. "12020"
  publisher?: string;
  provider: string; // name of the MetadataProvider that produced this result, e.g. "comicvine"
}

export interface StaffMember {
  name: string;
  role: string;
}

export interface MatchResult {
  series: SeriesMetadata;
  confidence: number;
  confirmed: boolean;
}

export interface VolumeMetadata {
  parsed: ParsedFile;
  series: SeriesMetadata;
}
