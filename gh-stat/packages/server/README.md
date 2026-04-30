# @kfang/ghstat-server

Standalone Node.js + Fastify HTTP server for `gh-stat`. Reads a YAML config file, syncs GitHub data into a local SQLite database, and serves a REST API plus an Alpine.js web dashboard.

## Requirements

- [Node.js](https://nodejs.org) ≥ 22
- A GitHub personal access token with read access to repositories and pull requests

## Quick start

```bash
# 1. Copy the example config
cp config.example.yaml config.yaml

# 2. Set your GitHub token (or put it directly in config.yaml)
export GITHUB_TOKEN=ghp_...

# 3. Edit config.yaml to add your orgs/repos
#    See Configuration section below

# 4. Install dependencies and build
npm install
npx nx run-many -t build

# 5. Start the server
node packages/server/dist/index.js
```

The server starts at `http://localhost:3000`. On startup, a background sync runs immediately (if `refresh.on_start: true`) and then repeats on the configured interval.

To use a config file at a different path:

```bash
CONFIG_PATH=/etc/gh-stat/config.yaml node packages/server/dist/index.js
```

## Configuration

The config file is YAML with `${ENV_VAR}` expansion for secrets.

```yaml
github:
  token: ${GITHUB_TOKEN}   # or paste the token directly
  orgs:
    - my-org               # sync all repos in this org
  repos:
    - owner/specific-repo  # sync individual repos (any owner)

persistence:
  type: sqlite
  sqlite:
    path: ./data/gh-stat.db   # created automatically

refresh:
  interval: 3600   # seconds between syncs (default: 3600)
  on_start: true   # run a sync when the server starts (default: true)

server:
  port: 3000         # default: 3000
  host: 0.0.0.0      # default: 0.0.0.0
```

You can mix `orgs` and `repos`. Repos discovered via `orgs` are deduplicated against explicitly listed `repos`.

## REST API

All endpoints return JSON. Error responses return a plain text or JSON body with the appropriate HTTP status code.

### Repositories

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos` | List all synced repos |
| `GET` | `/api/repos?org=<org>` | List repos filtered by owner/org |
| `GET` | `/api/repos/:owner/:repo` | Get a single repo |

### Pull requests

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/repos/:owner/:repo/pulls` | List all PRs for a repo |
| `GET` | `/api/repos/:owner/:repo/pulls?state=open` | Filter by state (`open`, `closed`) |

### Stats

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stats/:owner/:repo` | PR velocity + contributor stats + repo health |
| `GET` | `/api/stats/org/:org` | Org-level rollup stats |

### Sync

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sync` | Trigger a manual sync (runs in the background) |

### Example response

**`GET /api/stats/owner/my-repo`**

```json
{
  "repo": "owner/my-repo",
  "velocity": {
    "totalPRs": 142,
    "mergedPRs": 128,
    "mergeRate": 0.901,
    "avgTimeToMergeLabel": "1.4d",
    "p50CycleTimeMs": 86400000,
    "p90CycleTimeMs": 432000000,
    "weeklyThroughput": 3.2
  },
  "contributors": {
    "uniqueContributors": 8,
    "topContributor": "alice",
    "contributors": [...]
  },
  "health": {
    "daysSinceLastPush": 3,
    "isStale": false,
    "busFactor": 3,
    "openPRBacklog": 5
  }
}
```

## Web dashboard

Navigating to `http://localhost:3000` opens the dashboard. Pages are server-rendered HTML shells with Alpine.js components that fetch data from the API.

- **`/`** — Repository list with an org filter, summary stats, and staleness indicators
- **`/repo/:owner/:repo`** — Per-repo detail: PR velocity table, contributor breakdown, health metrics

The dashboard has no build step — Alpine.js is loaded from CDN.

## Development

```bash
# from repo root
npm install

# build all packages (Nx handles dependency ordering)
npx nx run-many -t build

# typecheck without emitting
npx nx run @kfang/ghstat-server:typecheck

# start the server
CONFIG_PATH=./config.yaml node packages/server/dist/index.js
```

HTML view files in `src/views/` are copied to `dist/views/` at build time and read from disk at request time.

## Docker

Build the image from the **repo root** (the Dockerfile lives at `packages/server/Dockerfile` but needs the monorepo as its build context):

```bash
docker build -f packages/server/Dockerfile -t ghstat .
```

Mount your `config.yaml` and a data directory for the SQLite database:

```bash
docker run \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  ghstat
```

To pass the GitHub token via environment variable instead of baking it into `config.yaml`:

```bash
docker run \
  -e GITHUB_TOKEN=ghp_... \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/data:/app/data \
  -p 3000:3000 \
  ghstat
```
