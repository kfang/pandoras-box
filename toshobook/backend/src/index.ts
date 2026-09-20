import { Config, ConfigProvider, Console, Effect, Fiber, FileSystem, Layer, Option, Path, Schedule, Schema } from "effect";
import { NodeServices } from "@effect/platform-node";
import { DatabaseServiceLive } from "./db/Database.ts";
import { JobRepository } from "./db/JobRepository.ts";
import { calculateFileHash } from "./utils.ts";
import { FileRepository } from "./db/FileRepository.ts";

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
      const filesys = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;

      const pattern = path.join(config.IMPORT_DIR, "**", "*.cbz");
      const cbzFilePaths = yield* filesys.glob(pattern);

      for (const fp of cbzFilePaths) {
        yield* jobRepository.addJob({
          job_key: `calculate_file_hash:${fp}`,
          job_kind: "CALCULATE_FILE_HASH",
          payload: JSON.stringify({ filepath: fp }),
          created_at: new Date().toISOString(),
        });
      }
    }

    if (job.job_kind === "CALCULATE_FILE_HASH") {
      const fs = yield* FileSystem.FileSystem;
      const fileRepository = yield* FileRepository;

      const { filepath } = JSON.parse(job.payload);
      const fStat = yield* fs.stat(filepath);
      if (fStat.type !== "File") {
        return;
      }

      const extension = filepath.split(".").at(-1)?.toUpperCase();
      const hash = yield* calculateFileHash(filepath);
      const size = Number(fStat.size);
      const fileMTime = Option
        .map(fStat.mtime, (d) => d.toISOString())
        .pipe(Option.getOrNull);

      const r1 = yield* fileRepository.addFile({
        path: filepath,
        size,
        mtime: fileMTime,
        hash,
        extension,
        checked_at: Temporal.Now.instant().toString(),
      });

      log.info(`${JSON.stringify(r1)}\n----`);
    }

    yield* jobRepository.finishJob(job.id);
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
  .mergeAll(
    JobRepository.layer,
    FileRepository.layer,
  )
  .pipe(
    Layer.provideMerge(CoreLive),
    Layer.provide(DatabaseServiceLive.pipe(Layer.provide(CoreLive))),
  )

const runnable = Effect.provide(program, RepositoryLive);
await Effect.runPromise(runnable);
