# synago — Agent Context

## Project

Song management app (ChordPro + OpenSong formats). pnpm monorepo with Turborepo, Fastify v5 backend, Alpine.js frontend, built for Docker/unRAID.

## Commands

| Command | Action |
|---|---|
| `pnpm install` | install all deps |
| `pnpm build` | turbo run build (PEG parsers → src/generated.ts, backend → dist/server.js, frontend → backend/public/js/main.js) |
| `pnpm test` | turbo run test (vitest across all packages) |
| `pnpm lint` | eslint packages/ --ext .ts |
| `pnpm typecheck` | turbo run typecheck (tsc --noEmit; skips peggy-* packages — generated code) |
| `pnpm format` | prettier --write |
| `pnpm dev:backend` | tsx watch packages/backend/src/server.ts |
| `pnpm dev:front` | esbuild --watch for frontend |

## Architecture

- **5 packages**: `peggy-opensong`, `peggy-chordpro`, `common`, `backend`, `frontend`
- **Backend layers**: Controller → Service → Repository (manual injection, no DI)
- **No ORM**: raw SQL via `node:sqlite` (SQLite) or `pg` Pool (Postgres), switchable via config
- **Auth**: better-auth, proxied at `/api/auth/*`
- **Frontend**: Alpine.js SPA, esbuild-bundled, served as static files by Fastify
- **Config**: `config.yaml` + Zod validation + env var overrides (PORT, HOST, DB_PROVIDER, DB_SQLITE_PATH, DATABASE_URL, AUTH_SECRET, AUTH_URL, LOG_LEVEL, DATA_DIR)
- **Docker**: multi-stage, entrypoint runs `auth migrate` then `node dist/server.js`

## Conventions

- TypeScript strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- ESM throughout (`"type": "module"`, import with `.ts` extensions via `allowImportingTsExtensions`)
- No semicolons, double quotes, trailing commas (enforced by Prettier)
- PEG parsers: hand-written `src/index.ts` exports typed API, generated code lives in `src/generated.ts` (excluded from lint + typecheck)
- PG queries use `$1` params, SQLite uses `?` params (inline in code, not a query builder)
- test: in-memory SQLite via `DatabaseSync(":memory:")` + `app.inject()` for controller tests
- No classes unless stateful (repositories, services, controllers are classes; standalone fns otherwise)
- `import type` for type-only imports

## Build

- PEG: `peggy -o src/generated.ts src/*.peg`
- Backend: `esbuild src/server.ts --bundle --platform=node --format=esm --outdir=dist --packages=external`
- Frontend: `esbuild src/main.ts --bundle --outdir=../backend/public/js`

## Key Imports

```ts
// shared types
import type { Song, SongCreate, SongUpdate } from "@synago/common/src/types.ts"

// db union type
import type { Database } from "../db.ts"
// Database = DatabaseSync | Pool
// use instanceof DatabaseSync to narrow, then call .prepare() / .query() directly

// peggy parsers
import { parse } from "@synago/peggy-opensong"
import { parse } from "@synago/peggy-chordpro"
```
