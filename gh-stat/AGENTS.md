# AGENTS.md

## Project Overview

A GitHub analytics platform that fetches repository and PR data via the GitHub API, caches it in SQLite, computes team and org metrics (PR velocity, cycle times, contributor breakdowns, code ownership), and exposes them via a standalone Fastify server or Backstage plugin. Built with TypeScript in an Nx monorepo.

## Architecture & Key Directories

| Path | Purpose |
|------|---------|
| `packages/github-data/` | GitHub API client library — fetches repos, PRs, reviews, teams, CODEOWNERS |
| `packages/stats/` | Pure stat calculation functions (PR velocity, repo health, review cycles, contributors) |
| `packages/persistence/` | Storage abstraction layer (SQLite or Backstage DB) and sync orchestration |
| `packages/server/` | Standalone Fastify HTTP server with REST routes and HTML dashboard views |
| `packages/backstage-backend/` | Backstage backend plugin integration |
| `packages/backstage-frontend/` | Backstage frontend plugin with React dashboard components |

**Entrypoints**:
- `packages/server/src/index.ts` — standalone server (Fastify, config loading, sync, routes)
- `packages/backstage-backend/src/index.ts` — Backstage backend plugin
- `packages/backstage-frontend/src/index.ts` — Backstage frontend plugin

**Data flow**: `github-data` (API) → `persistence` (storage + sync) → `stats` (calculations) → `server` / `backstage-*` (consumers)

## Development Setup

**Prerequisites**: Node.js 22, Bun (for running and lockfile)

```bash
# Install dependencies
npm install

# Run locally (after build, or directly with bun)
CONFIG_PATH=./config.yaml bun run packages/server/src/index.ts

# Build all packages
npm run build  # or: nx run-many -t build

# Typecheck
npm run typecheck  # or: nx run-many -t typecheck

# Docker
docker build -f packages/server/Dockerfile -t ghstat .
docker run -p 3000:3000 ghstat
```

Copy `config.example.yaml` to `config.yaml` and configure:

| Setting | Description |
|---------|-------------|
| `github.token` | GitHub API token (supports `${GITHUB_TOKEN}` env var expansion) |
| `github.orgs` | GitHub organizations to fetch repos from |
| `github.repos` | Individual repos to track |
| `github.lookback_days` | How far back to fetch PR data |
| `persistence.type` | `sqlite` (default) or `backstage` |
| `persistence.sqlite.path` | SQLite DB path (default: `./data/gh-stat.db`) |
| `server.port` | HTTP port (default: 3000) |
| `refresh.interval` | Auto-refresh interval |
| `refresh.on_start` | Whether to sync on startup |

## Key Conventions

- **File naming**: kebab-case (`repo-health.ts`, `code-owner-demand.ts`)
- **Variables/functions**: camelCase (`repoFullName`, `fetchPullRequests`)
- **Classes/interfaces**: PascalCase, no `I` prefix (`StorageProvider`, `KnexStorageProvider`)
- **Constants**: SCREAMING_SNAKE_CASE (`MAX_RETRIES`, `CODEOWNERS_PATHS`)
- **Imports**: ES modules with explicit `.js` extensions; cross-package via `@kfang/*` scoped namespace
- **Async style**: async/await; AsyncGenerator for paginated API calls (`async function*`)
- **Error handling**: try/catch with early returns; native `Error` (no custom error classes)
- **DI**: Manual wiring via factory functions (`createSqliteProvider`, `createGitHubClient`)
- **Architecture**: layered packages — API client → stats → persistence → server/plugins
- **TypeScript**: strict mode, ES2022 target, `noUncheckedIndexedAccess`

## Important Notes

- **No tests or CI** — project is early-stage (v0.1.0)
- **No linter/formatter config** — no `.eslintrc` or `.prettierrc` present
- Stats functions are **pure** — they receive data, not fetch it. Orchestration happens in server/plugins.
- Database migrations run automatically on `StorageProvider` instantiation via Knex
- Backstage mode uses a `ghstat_` table prefix to avoid collisions in shared databases
- CODEOWNERS fetching tries three paths (`.github/CODEOWNERS`, `CODEOWNERS`, `docs/CODEOWNERS`); returns null if none exist
- Incremental sync relies on `last_sync_time` per repo; falls back to `lookback_days` for full sync
- Bus factor calculation counts contributors with >=10% of merged PRs
- Frontend views (Alpine.js) served from `src/views/`; copied to `dist/` during build
