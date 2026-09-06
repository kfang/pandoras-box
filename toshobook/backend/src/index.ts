import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { ComicInfo } from "./comicinfo.ts";
import sevenZ from "./sevenZ.ts";
import xxHash from "@node-rs/xxhash";

const importPath = process.env["IMPORT_DIR"];
const comicsPath = process.env["COMICS_DIR"];

if (!importPath || !comicsPath) {
  console.error("no basePath defined");
  process.exit(1);
}

try {
  await fsp.access(importPath, fsp.constants.W_OK);
  await fsp.access(comicsPath, fsp.constants.W_OK);
} catch (e) {
  console.error(e);
  process.exit(1);
}

async function* getCbzFiles(basePath: string): AsyncGenerator<string> {
  const pattern = path.join(basePath, "**/*.cbz");
  console.log(`looking for cbz files in ${pattern}`);

  const files = fsp.glob(pattern);
  for await (const file of files) {
    const fileStat = await fsp.stat(file);
    if (!fileStat.isFile()) {
      continue;
    }
    yield file;
  }
}

for await (const f of getCbzFiles(importPath)) {
  console.log(`processing: ${f}`);

  const dataStream = fs.createReadStream(f);
  const hasher = xxHash.xxh3.Xxh3.withSeed();
  for await (const chunk of dataStream) {
    hasher.update(chunk);
  }
  const fileHash = hasher.digest().toString(16).padStart(16, "0");
  console.log(`\tfileHash: ${fileHash}`);

  console.log(`\textracting ComicInfo.xml`)

  const comicInfoXml = await sevenZ.extractFile(f, "ComicInfo.xml");
  if (!comicInfoXml) {
    continue;
  }

  const ci = ComicInfo.parse(comicInfoXml);
  if (!ci) {
    continue;
  }
}
