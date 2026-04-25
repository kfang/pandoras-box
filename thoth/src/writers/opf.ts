import { XMLParser, XMLBuilder } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import { $ } from "bun";
import type { VolumeMetadata } from "../types";
import type { MetadataWriter } from "./types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: false,
  parseAttributeValue: false,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: false,
});

async function extractFile(archivePath: string, entryPath: string): Promise<string> {
  const result = await $`unzip -p ${archivePath} ${entryPath}`.quiet();
  return result.text();
}

async function findOpfPath(archivePath: string): Promise<string> {
  const containerXml = await extractFile(archivePath, "META-INF/container.xml");
  const container = xmlParser.parse(containerXml);

  const rootfile =
    container?.container?.rootfiles?.rootfile;

  if (Array.isArray(rootfile)) {
    return rootfile[0]["@_full-path"];
  }
  return rootfile?.["@_full-path"] ?? "OEBPS/content.opf";
}

function getAuthorName(meta: VolumeMetadata): string | undefined {
  const authors = meta.series.staff.filter(
    (s) =>
      s.role === "Story" ||
      s.role === "Story & Art" ||
      s.role === "Original Story"
  );
  return authors.length > 0 ? authors[0].name : undefined;
}

function buildUpdatedOpf(
  originalOpf: string,
  meta: VolumeMetadata
): string {
  const opf = xmlParser.parse(originalOpf);
  const pkg = opf["package"] ?? opf;
  const metadata = pkg.metadata ?? {};

  const title =
    meta.series.title.english ||
    meta.series.title.romaji ||
    meta.parsed.seriesName;
  const seriesTitle = meta.parsed.subSeries
    ? `${title} - ${meta.parsed.subSeries}`
    : title;

  // Update dc:title
  metadata["dc:title"] = `${seriesTitle} Vol. ${meta.parsed.volume}`;

  // Update dc:creator
  const author = getAuthorName(meta);
  if (author) {
    metadata["dc:creator"] = author;
  }

  // Update dc:subject (genres)
  if (meta.series.genres.length > 0) {
    metadata["dc:subject"] = meta.series.genres;
  }

  // Update dc:description
  if (meta.series.description) {
    metadata["dc:description"] = meta.series.description;
  }

  // Update dc:publisher
  if (meta.parsed.publisher) {
    metadata["dc:publisher"] = meta.parsed.publisher;
  }

  // Update dc:date
  if (meta.series.startDate?.year) {
    metadata["dc:date"] = `${meta.series.startDate.year}`;
  }

  // Update dc:language
  metadata["dc:language"] = "en";

  // Handle calibre series metadata
  // Remove existing calibre series meta tags
  let metaEntries: any[] = [];
  if (metadata.meta) {
    metaEntries = Array.isArray(metadata.meta)
      ? metadata.meta
      : [metadata.meta];
    metaEntries = metaEntries.filter(
      (m: any) =>
        m["@_name"] !== "calibre:series" &&
        m["@_name"] !== "calibre:series_index"
    );
  }

  // Add calibre series metadata
  metaEntries.push(
    { "@_name": "calibre:series", "@_content": seriesTitle },
    {
      "@_name": "calibre:series_index",
      "@_content": String(meta.parsed.volume),
    }
  );

  metadata.meta = metaEntries;
  pkg.metadata = metadata;

  if (opf["package"]) {
    opf["package"] = pkg;
  }

  return xmlBuilder.build(opf);
}

export class OpfWriter implements MetadataWriter {
  async write(meta: VolumeMetadata, dryRun: boolean): Promise<void> {
    const opfPath = await findOpfPath(meta.parsed.filePath);
    const originalOpf = await extractFile(meta.parsed.filePath, opfPath);
    const updatedOpf = buildUpdatedOpf(originalOpf, meta);

    if (dryRun) {
      console.log(
        `\n[DRY RUN] Would update OPF (${opfPath}) in: ${meta.parsed.fileName}`
      );
      console.log(updatedOpf);
      return;
    }

    // Write updated OPF to temp directory preserving path structure, then inject
    const tmpDir = fs.mkdtempSync(path.join("/tmp", "thoth-"));
    const tmpOpfPath = path.join(tmpDir, opfPath);

    try {
      fs.mkdirSync(path.dirname(tmpOpfPath), { recursive: true });
      fs.writeFileSync(tmpOpfPath, updatedOpf);
      // Update the file within the zip at its original path
      await $`cd ${tmpDir} && zip ${meta.parsed.filePath} ${opfPath}`.quiet();
      console.error(`  ✓ Updated OPF in ${meta.parsed.fileName}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
