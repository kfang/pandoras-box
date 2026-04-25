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
  id: number;
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
