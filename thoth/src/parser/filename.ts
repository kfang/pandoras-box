import path from "path";
import type { ParsedFile, FileFormat } from "../types";

// Pattern 7: chapter-based — "{Series} - c{chapters} (v{NN}) [{group}].ext"
const CHAPTER_PATTERN =
  /^(.+?)\s*-\s*c([\d\-x]+)\s*\(v(\d+)\)\s*(?:\[([^\]]+)\])?\s*$/;

// Pattern 4: LN numbered — "{Series} - LN {NN} Premium.ext"
const LN_PATTERN = /^(.+?)\s*-\s*LN\s+(\d+)\s*(?:Premium)?$/;

// Pattern 5: "Volume NN" style — "{Series} - Volume {NN}.ext" or "{Series} SP - Volume {NN}.ext"
const VOLUME_WORD_PATTERN = /^(.+?)\s*-\s*Volume\s+(\d+)\s*(?:Premium)?$/;

// Pattern 6: bracket publisher — "{Series} v{NN} [{publisher}] [{group}].ext"
const BRACKET_PATTERN =
  /^(.+?)\s+v(\d+)\s*\[([^\]]+)\]\s*(?:\[([^\]]+)\])?$/;

// Pattern 1/2/3: volume with optional extras — captures everything before vNN as the full name
// This handles basic "Series vNN", "Series vNN (extras)", and "Series - SubSeries vNN (extras)"
const VOLUME_PATTERN = /^(.+?)\s+v(\d+)\s*(?:\(.*?\)\s*)*$/;

export function parseFilename(filePath: string): ParsedFile | null {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  if (ext !== "cbz" && ext !== "epub") return null;

  const format: FileFormat = ext as FileFormat;
  const fileName = path.basename(filePath);
  const stem = path.basename(filePath, path.extname(filePath));

  let match: RegExpMatchArray | null;

  // Pattern 7: chapter-based
  match = stem.match(CHAPTER_PATTERN);
  if (match) {
    return {
      filePath,
      fileName,
      format,
      seriesName: match[1].trim(),
      volume: parseInt(match[3], 10),
      chapters: match[2],
      group: match[4]?.trim(),
    };
  }

  // Pattern 4: LN numbered
  match = stem.match(LN_PATTERN);
  if (match) {
    return {
      filePath,
      fileName,
      format,
      seriesName: match[1].trim(),
      volume: parseInt(match[2], 10),
    };
  }

  // Pattern 5: "Volume NN" style
  match = stem.match(VOLUME_WORD_PATTERN);
  if (match) {
    return {
      filePath,
      fileName,
      format,
      seriesName: match[1].trim(),
      volume: parseInt(match[2], 10),
    };
  }

  // Pattern 6: bracket publisher
  match = stem.match(BRACKET_PATTERN);
  if (match) {
    return {
      filePath,
      fileName,
      format,
      seriesName: match[1].trim(),
      volume: parseInt(match[2], 10),
      publisher: match[3]?.trim(),
      group: match[4]?.trim(),
    };
  }

  // Pattern 1/2/3: generic volume — captures full name before vNN
  match = stem.match(VOLUME_PATTERN);
  if (match) {
    const fullName = match[1].trim();
    const year = extractYear(stem);
    return {
      filePath,
      fileName,
      format,
      seriesName: fullName,
      volume: parseInt(match[2], 10),
      year: year ?? undefined,
    };
  }

  return null;
}

function extractYear(stem: string): number | null {
  const match = stem.match(/\((\d{4})\)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Groups files by series name using prefix-based grouping.
 * Files like "Umineko When They Cry - Episode 1 - ..." and
 * "Umineko When They Cry - Episode 2 - ..." will be grouped under
 * "Umineko When They Cry" with subSeries set accordingly.
 */
export function groupBySeries(files: ParsedFile[]): Map<string, ParsedFile[]> {
  // First pass: group by exact series name
  const exactGroups = new Map<string, ParsedFile[]>();
  for (const file of files) {
    const existing = exactGroups.get(file.seriesName) ?? [];
    existing.push(file);
    exactGroups.set(file.seriesName, existing);
  }

  // Second pass: detect groups that share a common prefix before " - "
  // and merge them (for Umineko-style sub-series)
  const seriesNames = [...exactGroups.keys()];
  const mergeMap = new Map<string, string>(); // fullName -> groupName

  for (const name of seriesNames) {
    const dashIdx = name.indexOf(" - ");
    if (dashIdx === -1) continue;

    const prefix = name.substring(0, dashIdx);
    // Check if there are other series with the same prefix
    const siblings = seriesNames.filter(
      (n) => n !== name && n.startsWith(prefix + " - ")
    );

    if (siblings.length > 0) {
      // This is a sub-series — group under the common prefix
      mergeMap.set(name, prefix);
      for (const sib of siblings) {
        mergeMap.set(sib, prefix);
      }
    }
  }

  // Build final groups
  const groups = new Map<string, ParsedFile[]>();
  for (const [name, groupFiles] of exactGroups) {
    const groupName = mergeMap.get(name) ?? name;

    // If merging, set subSeries on the files
    if (mergeMap.has(name)) {
      const subName = name.substring(groupName.length + 3); // skip " - "
      for (const f of groupFiles) {
        f.subSeries = subName;
      }
    }

    const existing = groups.get(groupName) ?? [];
    existing.push(...groupFiles);
    groups.set(groupName, existing);
  }

  // Update seriesName on merged files
  for (const [groupName, groupFiles] of groups) {
    for (const f of groupFiles) {
      if (f.subSeries) {
        f.seriesName = groupName;
      }
    }
  }

  return groups;
}
