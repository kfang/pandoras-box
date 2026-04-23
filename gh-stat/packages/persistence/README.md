# @kfang/ghstat-persistence

Storage layer for `gh-stat`. Defines the `StorageProvider` interface and ships two implementations:

- **`SqliteStorageProvider`** — uses Bun's built-in `bun:sqlite`. Zero external dependencies. For standalone use.
- **`BackstageStorageProvider`** — wraps Backstage's `DatabaseService` (Knex). For use inside a Backstage backend plugin.

Both implementations upsert on conflict, so they are safe to call repeatedly during incremental syncs.

## Installation

```bash
bun add @kfang/ghstat-persistence @kfang/ghstat-github-data
```

## Usage

### SQLite (standalone)

```ts
import { SqliteStorageProvider } from "@kfang/ghstat-persistence";

const storage = new SqliteStorageProvider("./data/gh-stat.db");
// Tables are created automatically on construction.
```

### Backstage

```ts
import { BackstageStorageProvider } from "@kfang/ghstat-persistence";
import type { BackstageDatabaseService } from "@kfang/ghstat-persistence";

// Inside a Backstage plugin init:
const storage = new BackstageStorageProvider(database as unknown as BackstageDatabaseService);
// Tables are created automatically on first use (async migration).
```

### Saving data

```ts
import { fetchRepo, fetchPullRequests, createGitHubClient } from "@kfang/ghstat-github-data";

const client = createGitHubClient(process.env.GITHUB_TOKEN!);
const storage = new SqliteStorageProvider("./data/gh-stat.db");

// Save a repo
const repo = await fetchRepo(client, "owner", "my-repo");
await storage.saveRepo(repo);

// Save pull requests
for await (const pr of fetchPullRequests(client, "owner", "my-repo", { state: "all" })) {
  await storage.savePullRequest(pr, "owner/my-repo");
}

// Track sync time for incremental updates
await storage.setLastSyncTime("owner/my-repo", new Date());
```

### Reading data

```ts
// All repos (optionally filtered by org/owner)
const allRepos = await storage.getRepos();
const orgRepos = await storage.getRepos({ org: "my-org" });

// Pull requests for a repo
const prs = await storage.getPullRequests("owner/my-repo");

// Last sync timestamp (null if never synced)
const lastSync = await storage.getLastSyncTime("owner/my-repo");
if (lastSync) {
  console.log(`Last synced: ${lastSync.toISOString()}`);
}
```

## API

### `StorageProvider` interface

```ts
interface StorageProvider {
  saveRepo(repo: GhRepo): Promise<void>;
  savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void>;
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  getPullRequests(repoFullName: string): Promise<GhPullRequest[]>;
  getLastSyncTime(repoFullName: string): Promise<Date | null>;
  setLastSyncTime(repoFullName: string, time: Date): Promise<void>;
}
```

All writes are upserts — calling `saveRepo` or `savePullRequest` with the same primary key updates the existing record.

`getRepos` returns results ordered by `pushed_at` descending. `getPullRequests` returns results ordered by `created_at` descending.

### `SqliteStorageProvider`

```ts
new SqliteStorageProvider(path: string)
```

Creates (or opens) the SQLite database at `path`. The directory must exist — the constructor does not create it. Tables are created synchronously during construction using `CREATE TABLE IF NOT EXISTS`. WAL mode is enabled for better concurrent read performance.

**Schema tables:** `repos`, `pull_requests`, `sync_state`

### `BackstageStorageProvider`

```ts
new BackstageStorageProvider(database: BackstageDatabaseService)
```

Accepts Backstage's `DatabaseService` (obtained via `coreServices.database`). Table migration is async and runs before the first operation. Tables are prefixed with `ghstat_` to avoid conflicts with other Backstage plugins.

**Schema tables:** `ghstat_repos`, `ghstat_pull_requests`, `ghstat_sync_state`

## Development

```bash
# from repo root
bun install

# build github-data first (peer dependency for types)
bun x tsc --project packages/github-data/tsconfig.json

# typecheck
bun x tsc --project packages/persistence/tsconfig.json --noEmit

# build
bun x tsc --project packages/persistence/tsconfig.json
```

The SQLite implementation uses `bun:sqlite` (a Bun built-in). It will not work in Node.js — use the Backstage adapter or swap in a different driver if you need Node compatibility.
