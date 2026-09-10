import fs from "node:fs";
import { ComicInfo } from "./comicinfo.ts";
import sevenZ from "./sevenZ.ts";
import xxHash from "@node-rs/xxhash";
import { Config, ConfigProvider, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { NodeServices } from "@effect/platform-node";

const configSchema = Schema.Struct({
  IMPORT_DIR: Schema.NonEmptyString,
  COMICS_DIR: Schema.NonEmptyString,
});

const configProgram = Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const provider = yield* ConfigProvider.fromDotEnv();
  const config = yield* Config.schema(configSchema).parse(provider);

  yield* filesys.access(config.IMPORT_DIR, { writable: true });
  yield* filesys.access(config.COMICS_DIR, { writable: true });

  return config;
});

const cbzFiles = Effect.gen(function* () {
  const config = yield* configProgram;
  const filesys = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const isFile = (filepath: string) => Effect.gen(function* () {
    const fStat = yield* filesys.stat(filepath);
    return fStat.type === "File";
  });

  const pattern = path.join(config.IMPORT_DIR, "**", "*.cbz");
  const cbzFileStream = Stream
    .fromIterableEffect(filesys.glob(pattern))
    .pipe(Stream.filterEffect(isFile));

  const filtered = yield* Stream.runCollect(cbzFileStream);

  return filtered;
});

const fxs = await Effect.runPromise(cbzFiles.pipe(Effect.provide(NodeServices.layer)));

for (const f of fxs) {
  console.log(`processing: ${f}`);

  const dataStream = fs.createReadStream(f);
  const hasher = xxHash.xxh3.Xxh3.withSeed();
  for await (const chunk of dataStream) {
    hasher.update(chunk);
  }
  const fileHash = hasher.digest().toString(16).padStart(16, "0");
  console.log(`\tfileHash: ${fileHash}`);

  console.log(`\textracting ComicInfo.xml`);
  const comicInfoXml = await sevenZ.extractFile(f, "ComicInfo.xml");
  if (!comicInfoXml) {
    continue;
  }

  const ci = ComicInfo.parse(comicInfoXml);
  if (!ci) {
    continue;
  }
}
