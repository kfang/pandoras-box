# @kfang/ghstat-backstage-backend

Backstage backend plugin for `gh-stat`. Uses Backstage's new backend system (`createBackendPlugin`). Registers a scheduled sync task and an Express router under `/api/gh-stat`.

## Requirements

- Backstage with the new backend system (`@backstage/backend-plugin-api` ≥ 0.6)
- A GitHub personal access token in your Backstage `app-config.yaml`

## Installation

```bash
# in your Backstage backend package
yarn add @kfang/ghstat-backstage-backend
```

## Setup

### 1. Register the plugin

In your Backstage backend's `index.ts` (or wherever you register plugins):

```ts
import { ghStatPlugin } from "@kfang/ghstat-backstage-backend";

const backend = createBackend();
// ... other plugins
backend.add(ghStatPlugin);
await backend.start();
```

### 2. Add config to `app-config.yaml`

```yaml
ghStat:
  github:
    token: ${GITHUB_TOKEN}
    orgs:
      - my-org
    repos:
      - owner/specific-repo
  refresh:
    interval: 3600   # seconds between syncs (default: 3600)
```

The plugin reads config via `coreServices.rootConfig` using the `ghStat.*` namespace. The GitHub token must be a plain string — the plugin does not use Backstage's `ScmIntegrations` or `GithubCredentialsProvider`.

### 3. Database

The plugin uses `coreServices.database` (Backstage's managed database). Tables are created automatically on first startup. No manual migration steps are needed.

Table names are prefixed with `ghstat_` to avoid conflicts:
- `ghstat_repos`
- `ghstat_pull_requests`
- `ghstat_sync_state`
- `ghstat_pr_comments`

## REST API

All routes are mounted under `/api/gh-stat/` (Backstage routes the `gh-stat` plugin ID automatically).

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/gh-stat/repos` | List all synced repos |
| `GET` | `/api/gh-stat/repos?org=<org>` | Filter repos by owner/org |
| `GET` | `/api/gh-stat/stats/:owner/:repo` | PR velocity + contributors + health for a repo |
| `GET` | `/api/gh-stat/stats/org/:org` | Org-level rollup stats |

These are the same data shapes as the standalone server — see the `@kfang/ghstat-stats` package for field documentation.

## Scheduler

The plugin registers a task with Backstage's `TaskScheduler`:

```
id:        gh-stat-sync
frequency: { seconds: <ghStat.refresh.interval> }
timeout:   30 minutes
```

The sync runs a full fetch of all configured orgs and repos, using the last-sync timestamp for incremental PR updates. Sync logs appear via Backstage's logger at `info` level.

## Development

```bash
# from repo root
bun install

# build (Nx builds upstream packages first)
bunx nx run @kfang/ghstat-backstage-backend:build

# typecheck
bunx nx run @kfang/ghstat-backstage-backend:typecheck
```

To test the plugin locally, register it in a Backstage dev instance and check the Backstage logs for sync output. The `/api/gh-stat/repos` endpoint is the quickest way to confirm data is flowing in.

## Exports

```ts
import { ghStatPlugin } from "@kfang/ghstat-backstage-backend";
// ghStatPlugin: BackendFeature — pass to backend.add()
```
