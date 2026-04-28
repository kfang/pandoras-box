# @kfang/ghstat-persistence

Storage layer for `gh-stat`. Defines the `StorageProvider` interface and ships a single Knex-based implementation with factory functions for SQLite and Backstage deployments.

Both factory functions apply migrations automatically on first use, and all writes use upsert semantics — safe to call repeatedly during incremental syncs.

## Installation

```bash
bun add @kfang/ghstat-persistence @kfang/ghstat-github-data
```

## Usage

### SQLite (standalone)

```ts
import { createSqliteProvider } from "@kfang/ghstat-persistence";

const storage = createSqliteProvider("./data/gh-stat.db");
// Tables are created automatically on first use. WAL mode is enabled.
```

### Backstage

```ts
import { createBackstageProvider } from "@kfang/ghstat-persistence";
import type { BackstageDatabaseService } from "@kfang/ghstat-persistence";

// Inside a Backstage plugin init:
const storage = createBackstageProvider(database as unknown as BackstageDatabaseService);
// Tables are created automatically on first use (async migration).
// Table names are prefixed with ghstat_ to avoid conflicts.
```

### Saving data

```ts
import { fetchRepo, fetchPullRequests, createGitHubClient } from "@kfang/ghstat-github-data";

const client = createGitHubClient(process.env.GITHUB_TOKEN!);
const storage = createSqliteProvider("./data/gh-stat.db");

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

### Sync orchestration

`syncAll` handles the full fetch-and-store cycle for all configured orgs and repos, including incremental PR sync based on the last-sync timestamp:

```ts
import { syncAll } from "@kfang/ghstat-persistence";

await syncAll(client, storage, {
  github: {
    orgs: ["my-org"],
    repos: ["owner/other-repo"],
  },
});
```

## API

### `StorageProvider` interface

```ts
interface StorageProvider {
  saveRepo(repo: GhRepo): Promise<void>;
  savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void>;
  saveComment(comment: GhPRComment, repoFullName: string): Promise<void>;
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  getPullRequests(repoFullName: string): Promise<GhPullRequest[]>;
  getLastSyncTime(repoFullName: string): Promise<Date | null>;
  setLastSyncTime(repoFullName: string, time: Date): Promise<void>;
}
```

All writes are upserts — calling `saveRepo` or `savePullRequest` with the same primary key updates the existing record.

`getRepos` returns results ordered by `pushed_at` descending. `getPullRequests` returns results ordered by `created_at` descending.

### `createSqliteProvider(path: string): KnexStorageProvider`

Creates (or opens) a SQLite database at `path` using Knex with the `better-sqlite3` driver. WAL mode is enabled for better concurrent read performance. The directory at `path` must already exist.

**Schema tables:** `repos`, `pull_requests`, `sync_state`, `pr_comments`

### `createBackstageProvider(database: BackstageDatabaseService): KnexStorageProvider`

Accepts Backstage's `DatabaseService` (obtained via `coreServices.database`). Table migration is async and runs before the first operation. Tables are prefixed with `ghstat_` to avoid conflicts with other Backstage plugins.

**Schema tables:** `ghstat_repos`, `ghstat_pull_requests`, `ghstat_sync_state`, `ghstat_pr_comments`

### `KnexStorageProvider`

The concrete class returned by both factory functions. Implements `StorageProvider`. You can also construct it directly if you already have a `Knex` instance:

```ts
import { KnexStorageProvider } from "@kfang/ghstat-persistence";
import knex from "knex";

const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
const storage = new KnexStorageProvider(db, "ghstat_");
```

The second argument is an optional table name prefix (default: `""`).

## Development

```bash
# from repo root
bun install

# build (Nx builds upstream packages first)
bunx nx run @kfang/ghstat-persistence:build

# typecheck
bunx nx run @kfang/ghstat-persistence:typecheck
```
