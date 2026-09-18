import { Config, ConfigProvider, Console, Effect, Fiber, FileSystem, Layer, Option, Path, Schedule, Schema } from "effect";
import { NodeServices } from "@effect/platform-node";
import { processImportFile } from "./import.ts";
import { DatabaseServiceLive } from "./db/Database.ts";
import { JobRepository, JobRepositoryLive } from "./db/JobRepository.ts";

const configSchema = Schema.Struct({
  COMICS_DIR: Schema.NonEmptyString,
  DATA_DIR: Schema.NonEmptyString,
  IMPORT_DIR: Schema.NonEmptyString,
});

const configProgram = Effect.gen(function*() {
  const filesys = yield* FileSystem.FileSystem;
  const provider = yield* ConfigProvider.fromDotEnv();
  const config = yield* Config.schema(configSchema).parse(provider);

  yield* filesys.access(config.COMICS_DIR, { writable: true });
  yield* filesys.access(config.DATA_DIR, { writable: true });
  yield* filesys.access(config.IMPORT_DIR, { writable: true });

  return config;
});

const cbzFiles = (importDir: string) => Effect.gen(function*() {
  const filesys = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const pattern = path.join(importDir, "**", "*.cbz");
  return yield* filesys.glob(pattern);
});

const worker = Effect.repeat(
  Effect.gen(function*() {
    const jobRepository = yield* JobRepository;
    const log = yield* Console.Console;
    const job = yield* jobRepository.takeJob();

    if (!job) {
      return;
    }

    if (job.job_kind === "SCAN_IMPORT") {
      const config = yield* configProgram;
      const cbzFilePaths = yield* cbzFiles(config.IMPORT_DIR)

      for (const fp of cbzFilePaths) {
        yield* jobRepository.addJob({
          job_key: `calculate_file_hash:${fp}`,
          job_kind: "CALCULATE_FILE_HASH",
          payload: JSON.stringify({ filepath: fp }),
          created_at: new Date().toISOString(),
        });
      }
    } else if (job.job_kind === "CALCULATE_FILE_HASH") {
      const payload = JSON.parse(job.payload);
      yield* processImportFile(payload.filepath);
    } else {
      log.debug(job);
    }

    yield* jobRepository.deleteJob(job.id);
  }),
  Schedule.forever.pipe(Schedule.addDelay(() => Effect.succeed("1000 millis"))),
)

const program = Effect.gen(function*() {
  const jobRepository = yield* JobRepository;

  yield* jobRepository.addJob({
    job_key: "scan_import",
    job_kind: "SCAN_IMPORT",
    payload: "",
    created_at: new Date().toISOString(),
  });

  const workers = Effect.all(
    Array.from({ length: 10 }).map(() => worker),
    { concurrency: "unbounded" },
  );

  const fiber = yield* Effect.forkChild(workers);
  yield* Fiber.join(fiber);
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
