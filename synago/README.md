# synago

Song management application supporting ChordPro and OpenSong formats. Designed for self-hosting on unRAID.

## Features

- REST API for song CRUD
- Built-in ChordPro and OpenSong format parsers
- Authentication via better-auth (email/password)
- Lightweight Alpine.js SPA frontend
- SQLite for development, PostgreSQL for production
- Docker multi-stage build (unRAID-ready)
- OpenTelemetry tracing (auto-instrumentation)
- Configurable via YAML + environment variables

## Quick Start

```bash
pnpm install
pnpm build
pnpm dev:backend
```

The server starts at `http://localhost:3000`.

### Frontend development

```bash
pnpm dev:front
```

Rebuilds the SPA on file changes (output goes to `packages/backend/public/js/`).

## Configuration

synago reads `config.yaml` from the working directory (or `CONFIG_PATH` env var). Environment variables override YAML values.

```yaml
server:
  port: 3000
  host: "0.0.0.0"

db:
  provider: sqlite       # or "postgres"
  sqlite:
    path: "/data/synago.db"
  postgres:
    url: ""               # DATABASE_URL

auth:
  secret: ""              # min 32 chars, auto-generated if empty
  url: "http://localhost:3000"

log:
  level: info

data_dir: /data
```

### Env Vars

| Env Var | Overrides |
|---|---|
| `PORT` | `server.port` |
| `HOST` | `server.host` |
| `DB_PROVIDER` | `db.provider` |
| `DB_SQLITE_PATH` | `db.sqlite.path` |
| `DATABASE_URL` | `db.postgres.url` |
| `AUTH_SECRET` | `auth.secret` |
| `AUTH_URL` | `auth.url` |
| `LOG_LEVEL` | `log.level` |
| `DATA_DIR` | `data_dir` |

## Docker

```bash
docker build -t synago .
docker run -d \
  -p 3000:3000 \
  -v /path/to/data:/data \
  -e AUTH_SECRET=your-secret-key-min-32-chars \
  synago
```

Entrypoint runs `auth migrate` (better-auth tables) then starts the server. Migrations (SQL files in `{data_dir}/migrations/`) are applied automatically on startup.

## Project Structure

```
packages/
  peggy-opensong/    OpenSong PEG parser
  peggy-chordpro/    ChordPro PEG parser
  common/            Shared TypeScript types
  backend/           Fastify v5 server (API + static files)
  frontend/          Alpine.js SPA
```

Backend follows a Controller → Service → Repository pattern with manual dependency injection. Database access is raw SQL via `node:sqlite` (SQLite) or `pg` Pool (PostgreSQL).

## Tests

```bash
pnpm test        # run all tests
pnpm test:dev    # run tests in watch mode
```

Backend tests use in-memory SQLite databases with Fastify's `app.inject()` for HTTP-level testing.
