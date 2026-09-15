import { Kysely } from "kysely";

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
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("file").execute();
}
