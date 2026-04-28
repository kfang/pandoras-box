# gh-stat

GitHub statistics and analytics for teams and organizations. Pulls repository and pull request data from the GitHub API, caches it locally, and calculates metrics: PR velocity, cycle times, contributor breakdowns, repo health, and org-level rollups.

## Deployment modes

| Mode | Package | Runtime |
|---|---|---|
| Standalone server | `@kfang/ghstat-server` | Bun HTTP server + Alpine.js frontend |
| Backstage plugin | `@kfang/ghstat-backstage-backend` + `@kfang/ghstat-backstage-frontend` | Backstage new backend system |

Both modes share the same core packages for data fetching, storage, and calculations.

## Packages

```
packages/
├── github-data       GitHub API client and normalized types
├── stats             Pure stat calculation functions
├── persistence       Storage layer (SQLite or Backstage DB) + sync orchestration
├── server            Standalone Bun HTTP server + web dashboard
├── backstage-backend Backstage backend plugin
└── backstage-frontend Backstage frontend plugin
```

### Dependency graph

```
github-data
  ├── stats
  ├── persistence ──── server
  │                └── backstage-backend
  └── backstage-frontend
```

## Quick start (standalone server)

```bash
# Install dependencies
bun install

# Copy and edit the config
cp packages/server/config.example.yaml config.yaml
# Set github.token and add your orgs/repos

# Build all packages
bun run build

# Start the server
CONFIG_PATH=./config.yaml bun run packages/server/src/index.ts
```

The server starts at `http://localhost:3000`. See [`packages/server`](packages/server/README.md) for full configuration reference and Docker setup.

## Quick start (Backstage plugin)

Install both packages into your Backstage monorepo and add config to `app-config.yaml`:

```yaml
ghStat:
  github:
    token: ${GITHUB_TOKEN}
    orgs:
      - my-org
  refresh:
    interval: 3600
```

See [`packages/backstage-backend`](packages/backstage-backend/README.md) and [`packages/backstage-frontend`](packages/backstage-frontend/README.md) for installation steps.

## Development

This repo uses [Bun](https://bun.sh) as the package manager and [Nx](https://nx.dev) for task orchestration.

```bash
# Install dependencies
bun install

# Build all packages (Nx handles dependency ordering)
bun run build

# Typecheck all packages
bun run typecheck

# Build or typecheck a single package
bunx nx run @kfang/ghstat-persistence:build
bunx nx run @kfang/ghstat-server:typecheck
```

Nx caches build and typecheck outputs. Re-running a task on unchanged code will restore from cache. The task graph ensures upstream packages are built before dependents.

## Configuration reference

See the individual package READMEs:

- [github-data](packages/github-data/README.md) — API client and types
- [stats](packages/stats/README.md) — calculation functions and return types
- [persistence](packages/persistence/README.md) — storage interface, factory functions, sync
- [server](packages/server/README.md) — YAML config schema, REST API, Docker
- [backstage-backend](packages/backstage-backend/README.md) — Backstage setup, REST routes, scheduler
- [backstage-frontend](packages/backstage-frontend/README.md) — React components, API client, pages
