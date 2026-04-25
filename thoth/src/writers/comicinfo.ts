import { XMLBuilder } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { $ } from "bun";
import type { VolumeMetadata } from "../types";
import type { MetadataWriter } from "./types";

function getAuthor(meta: VolumeMetadata): string | undefined {
  const authors = meta.series.staff.filter(
    (s) => s.role === "Story" || s.role === "Story & Art" || s.role === "Original Story"
  );
  return authors.length > 0 ? authors.map((a) => a.name).join(", ") : undefined;
}

function getArtist(meta: VolumeMetadata): string | undefined {
  const artists = meta.series.staff.filter(
    (s) => s.role === "Art" || s.role === "Story & Art"
  );
  return artists.length > 0 ? artists.map((a) => a.name).join(", ") : undefined;
}

function buildComicInfoXml(meta: VolumeMetadata): string {
  const title =
    meta.series.title.english || meta.series.title.romaji || meta.parsed.seriesName;
  const seriesName = meta.parsed.subSeries
    ? `${title} - ${meta.parsed.subSeries}`
    : title;

  const info: Record<string, unknown> = {
    "?xml": { "@_version": "1.0", "@_encoding": "utf-8" },
    ComicInfo: {
      "@_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      "@_xmlns:xsd": "http://www.w3.org/2001/XMLSchema",
      Series: seriesName,
      Number: meta.parsed.volume,
      Title: `${seriesName} Vol. ${meta.parsed.volume}`,
      Summary: meta.series.description ?? "",
      Writer: getAuthor(meta) ?? "",
      Penciller: getArtist(meta) ?? "",
      Genre: meta.series.genres.join(", "),
      Tags: meta.series.tags.join(", "),
      Publisher: meta.parsed.publisher ?? "",
      Year: meta.series.startDate?.year ?? "",
      LanguageISO: "en",
      Web: meta.series.siteUrl ?? "",
      Manga: "Yes",
    },
  };

  // Remove empty string values
  const comicInfo = info.ComicInfo as Record<string, unknown>;
  for (const [key, value] of Object.entries(comicInfo)) {
    if (value === "") delete comicInfo[key];
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(info);
}

export class ComicInfoWriter implements MetadataWriter {
  async write(meta: VolumeMetadata, dryRun: boolean): Promise<void> {
    const xml = buildComicInfoXml(meta);

    if (dryRun) {
      console.log(`\n[DRY RUN] Would inject ComicInfo.xml into: ${meta.parsed.fileName}`);
      console.log(xml);
      return;
    }

    // Write ComicInfo.xml to a temp file, then inject into the CBZ
    const tmpDir = fs.mkdtempSync(path.join("/tmp", "thoth-"));
    const tmpFile = path.join(tmpDir, "ComicInfo.xml");

    try {
      fs.writeFileSync(tmpFile, xml);
      // zip -j updates/adds a single file at the root of the archive
      await $`zip -j ${meta.parsed.filePath} ${tmpFile}`.quiet();
      console.error(`  ✓ Injected ComicInfo.xml into ${meta.parsed.fileName}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
