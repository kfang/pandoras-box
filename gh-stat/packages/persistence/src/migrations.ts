export interface Migration {
  version: number;
  /** Name of the table created by this migration — used to baseline pre-existing databases. */
  table: string;
  sql: string;
}

export interface SyncMigrationAdapter {
  createTrackingTable(): void;
  tableExists(name: string): boolean;
  getAppliedVersions(): Set<number>;
  /** Execute migration SQL and record the version atomically. */
  applyMigration(version: number, sql: string): void;
  /** Record a version without running SQL — used when baselining pre-existing databases. */
  recordVersion(version: number): void;
}

export interface AsyncMigrationAdapter {
  createTrackingTable(): Promise<void>;
  tableExists(name: string): Promise<boolean>;
  getAppliedVersions(): Promise<Set<number>>;
  applyMigration(version: number, sql: string): Promise<void>;
  recordVersion(version: number): Promise<void>;
}

// These two functions share identical logic — keep them in sync when changing either.

export function runMigrationsSync(
  adapter: SyncMigrationAdapter,
  migrations: ReadonlyArray<Migration>,
): void {
  adapter.createTrackingTable();
  const applied = adapter.getAppliedVersions();
  if (applied.size === 0) {
    for (const { version, table } of migrations) {
      if (adapter.tableExists(table)) {
        adapter.recordVersion(version);
        applied.add(version);
      }
    }
  }
  for (const { version, sql } of migrations) {
    if (!applied.has(version)) {
      adapter.applyMigration(version, sql);
    }
  }
}

export async function runMigrations(
  adapter: AsyncMigrationAdapter,
  migrations: ReadonlyArray<Migration>,
): Promise<void> {
  await adapter.createTrackingTable();
  const applied = await adapter.getAppliedVersions();
  if (applied.size === 0) {
    for (const { version, table } of migrations) {
      if (await adapter.tableExists(table)) {
        await adapter.recordVersion(version);
        applied.add(version);
      }
    }
  }
  for (const { version, sql } of migrations) {
    if (!applied.has(version)) {
      await adapter.applyMigration(version, sql);
    }
  }
}
