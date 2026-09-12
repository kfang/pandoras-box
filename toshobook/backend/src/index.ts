import { Config, ConfigProvider, Console, Effect, FileSystem, Path, Schema } from "effect";
import { NodeServices } from "@effect/platform-node";
import { extractFileFromArchive, calculateFileHash } from "./utils.ts";
import { ComicInfo } from "./comicinfo.ts";

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

const cbzFiles = (importDir: string) => Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const pattern = path.join(importDir, "**", "*.cbz");
  return yield* filesys.glob(pattern);
});

const processFile = (filepath: string) => Effect.gen(function* () {
  const log = yield* Console.Console;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const fStat = yield* fs.stat(filepath);
  if (fStat.type !== "File") {
    return;
  }

  const fileName = path.basename(filepath);
  const fileHash = yield* calculateFileHash(filepath);
  const fileBytes = fStat.size;

  const raw = yield* extractFileFromArchive(filepath, "ComicInfo.xml");
  const ci = ComicInfo.parse(raw);

  log.info(filepath);
  log.info(`\tname: ${fileName}`);
  log.info(`\tsize: ${fileBytes} bytes`);
  log.info(`\thash: ${fileHash}`);
  log.info(raw);
});

const program = Effect.gen(function* () {
  const config = yield* configProgram;
  const cbzFilePaths = yield* cbzFiles(config.IMPORT_DIR)

  for (const filepath of cbzFilePaths) {
    yield* processFile(filepath);
  }
});

await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
