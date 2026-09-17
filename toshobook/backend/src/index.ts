import { Config, ConfigProvider, Console, Effect, FileSystem, Layer, Option, Path, Schema } from "effect";
import { NodeServices } from "@effect/platform-node";
import { processImportFile } from "./import.ts";
import { DatabaseServiceLive } from "./db/Database.ts";
import { JobRepository, JobRepositoryLive } from "./db/JobRepository.ts";

const configSchema = Schema.Struct({
  COMICS_DIR: Schema.NonEmptyString,
  DATA_DIR: Schema.NonEmptyString,
  IMPORT_DIR: Schema.NonEmptyString,
});

const configProgram = Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const provider = yield* ConfigProvider.fromDotEnv();
  const config = yield* Config.schema(configSchema).parse(provider);

  yield* filesys.access(config.COMICS_DIR, { writable: true });
  yield* filesys.access(config.DATA_DIR, { writable: true });
  yield* filesys.access(config.IMPORT_DIR, { writable: true });

  return config;
});

const cbzFiles = (importDir: string) => Effect.gen(function* () {
  const filesys = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const pattern = path.join(importDir, "**", "*.cbz");
  return yield* filesys.glob(pattern);
});

const program = Effect.gen(function* () {
  const jobRepository = yield* JobRepository;
  yield* jobRepository.addJob({ job_key: "scan_import", job_kind: "SCAN_IMPORT", payload: {} });

  const log = yield* Console.Console;
  const job = yield* jobRepository.takeJob();
  log.info(Option.getOrNull(job));

  const config = yield* configProgram;
  const cbzFilePaths = yield* cbzFiles(config.IMPORT_DIR)
  yield* Effect.all(cbzFilePaths.map(processImportFile), { concurrency: 10 });
});

const CoreLive = Layer
  .mergeAll(
    NodeServices.layer,
  );

const RepositoryLive = Layer
  .mergeAll(JobRepositoryLive)
  .pipe(
    Layer.provideMerge(CoreLive),
    Layer.provide(DatabaseServiceLive.pipe(Layer.provide(CoreLive))),
  )

const runnable = Effect.provide(program, RepositoryLive);
await Effect.runPromise(runnable);
