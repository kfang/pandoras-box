import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { Database } from "./db.ts"

async function exec(db: Database, sql: string, params?: unknown[]): Promise<void> {
  if (db instanceof DatabaseSync) {
    const stmt = db.prepare(sql)
    if (params && params.length > 0) {
      stmt.run(...params as never[])
    } else {
      stmt.run()
    }
  } else {
    await db.query(sql, params ?? [])
  }
}

async function query(db: Database, sql: string): Promise<string[]> {
  if (db instanceof DatabaseSync) {
    const rows = db.prepare(sql).all() as { name: string }[]
    return rows.map((r) => r.name)
  }
  const result = await db.query(sql)
  return result.rows.map((r: { name: string }) => r.name)
}

export async function migrate(db: Database, dir: string): Promise<void> {
  const migrationDir = join(dir, "migrations")

  let files: string[]
  try {
    files = readdirSync(migrationDir).sort()
  } catch {
    console.log("  No migration directory found, skipping")
    return
  }

  await exec(
    db,
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  )

  const applied = await query(db, "SELECT name FROM _migrations")

  for (const file of files) {
    if (!file.endsWith(".sql")) continue
    if (applied.includes(file)) continue

    const sql = readFileSync(join(migrationDir, file), "utf-8")
    console.log(`  Applying migration: ${file}`)
    await exec(db, sql)
    await exec(db, "INSERT INTO _migrations (name) VALUES (?)", [file])
  }
}
