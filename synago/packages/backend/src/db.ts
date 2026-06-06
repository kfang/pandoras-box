import { DatabaseSync } from "node:sqlite"
import { Pool } from "pg"
import type { Config } from "./config.ts"

export type Database = DatabaseSync | Pool

export function createDb(config: Config): Database {
  if (config.db.provider === "postgres") {
    if (!config.db.postgres.url) {
      throw new Error("PostgreSQL provider selected but no DATABASE_URL configured")
    }
    return new Pool({ connectionString: config.db.postgres.url })
  }

  return new DatabaseSync(config.db.sqlite.path)
}
