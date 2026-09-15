import SQLite from "better-sqlite3";
import { Console, Context, Effect, FileSystem, Layer, Path } from "effect";
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

export const DatabaseServiceLive = Layer.effect(
  DatabaseService,
  Effect.gen(function* () {
    const db = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const log = yield* Console.Console;
        const filesys = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;

        // TODO: grab configuration
        const dialect = new SqliteDialect({
          database: new SQLite(":memory:"),
        });
        const db = new Kysely<Database>({ dialect });

        log.info("...running migrations (TODO)")
        const readdir = (path: string): Promise<string[]> => Effect.runPromise(filesys.readDirectory(path));
        const join = path.join;
        const provider = new FileMigrationProvider({
          fs: { readdir },
          path: { join },
          migrationFolder: path.join(import.meta.dirname, "migrations"),
        });
        const migrator = new Migrator({ db, provider });
        const migrateResult = yield* Effect.tryPromise(() => migrator.migrateToLatest());

        migrateResult.results?.forEach((res) => {
          log.info(`${res.direction}\t${res.status}\t${res.migrationName}`);
        })

        return db;
      }),
      (db) => Effect.gen(function* () {
        yield* Effect.promise(db.destroy);
      }),
    );
    return { db };
  }),
);
