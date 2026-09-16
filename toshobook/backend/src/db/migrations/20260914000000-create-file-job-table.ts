import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("file")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("path", "text", (col) => col.notNull().unique())
    .addColumn("size", "integer", (col) => col.notNull())
    .addColumn("mtime", "text")
    .addColumn("hash", "blob")
    .addColumn("checked_at", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("job")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("job_key", "text", (col) => col.notNull())
    .addColumn("job_kind", "text", (col) => col.notNull())
    .addColumn("payload", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull())
    .addColumn("taken_at", "text")
    .addColumn("completed_at", "text")
    .addColumn("result", "text")
    .addColumn("error", "text")
    .execute();

  await db.schema
    .createIndex("jobs_key_unique")
    .on("job")
    .column("job_key")
    .unique()
    .where(sql.ref("created_at"), "is", null)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("jobs_key_unique").execute();
  await db.schema.dropTable("job").execute();
  await db.schema.dropTable("file").execute();
}
