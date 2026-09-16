import SQLite from "better-sqlite3";
import { Console, Context, Data, Effect, FileSystem, Layer, Path } from "effect";
import { Kysely, SqliteDialect, type Generated } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";

export interface FilesTable {
  id: Generated<number>;
  path: string;
  size: number;
  mtime: string | null;
  hash: Uint8Array | null;
  checked_at: string;
}

export interface Database {
  files: FilesTable;
}

export class DatabaseService extends Context.Service<
  DatabaseService,
  {
    readonly db: Kysely<Database>,
  }
>()("DatabaseService") { }

export class DatabaseMigrationFailure extends Data.TaggedError("DatabaseMigrationFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> { }

const migrationResult = (db: Kysely<Database>) => Effect.gen(function* () {
  const log = yield* Console.Console;
  const filesys = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const provider = new FileMigrationProvider({
    fs: { readdir: (path) => Effect.runPromise(filesys.readDirectory(path)) },
    path: { join: path.join },
    migrationFolder: path.join(import.meta.dirname, "migrations"),
  });

  const migrator = new Migrator({ db, provider });

  log.info("running database migrations")
  const migrateResult = yield* Effect.tryPromise(() => migrator.migrateToLatest());

  migrateResult.results?.forEach((res) => {
    log.debug(`...name=${res.migrationName} direction=${res.direction} status=${res.status}`);
  });

  if (migrateResult.error) {
    return yield* Effect.die(new DatabaseMigrationFailure({
      message: "database migration failed",
      cause: migrateResult.error,
    }))
  }

  return migrateResult;
});

export const DatabaseServiceLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        // TODO: grab configuration
        const database = new SQLite(":memory:");
        const dialect = new SqliteDialect({ database });
        const db = new Kysely<Database>({ dialect });

        // run through the database migrations
        yield* migrationResult(db);

        return db;
      }),
      // on release, destroy db
      (db: Kysely<Database>) => Effect.promise(db.destroy),
    );
    return { db };
  }),
);
