# @kfang/ghstat-backstage-frontend

Backstage frontend plugin for `gh-stat`. Provides a React-based dashboard with org-level rollups, per-repo PR velocity, contributor tables, and repo health metrics. Fetches data from `@kfang/ghstat-backstage-backend` via Backstage's `fetchApi`.

## Requirements

- Backstage frontend app (`@backstage/core-plugin-api` ≥ 1.9)
- `@kfang/ghstat-backstage-backend` installed and running in the same Backstage instance

## Installation

```bash
# in your Backstage app package
yarn add @kfang/ghstat-backstage-frontend
```

## Setup

### 1. Register the API

In your app's `apis.ts` (or wherever you define API factories):

```ts
import {
  ghStatApiRef,
  GhStatClient,
} from "@kfang/ghstat-backstage-frontend";
import {
  discoveryApiRef,
  fetchApiRef,
  createApiFactory,
} from "@backstage/core-plugin-api";

export const apis: AnyApiFactory[] = [
  // ... your other APIs
  createApiFactory({
    api: ghStatApiRef,
    deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
    factory: ({ discoveryApi, fetchApi }) =>
      new GhStatClient({ discoveryApi, fetchApi }),
  }),
];
```

### 2. Add the page to your app routes

In your app's `App.tsx`:

```tsx
import { GhStatPage } from "@kfang/ghstat-backstage-frontend";

// Inside <FlatRoutes>:
<Route path="/gh-stat" element={<GhStatPage />} />
```

### 3. Add a sidebar link (optional)

In your `Root.tsx` or sidebar component:

```tsx
import { SidebarItem } from "@backstage/core-components";
// use any icon you like, e.g. from @material-ui/icons
<SidebarItem icon={BarChartIcon} to="gh-stat" text="GH Stats" />
```

## Pages

### Org dashboard (`/gh-stat`)

Lists all synced repos in a table with language, star count, open issue count, and last-push date. Includes a text filter to scope the view to a specific org. When an org is selected, summary stat cards appear showing:

- Total repos
- Merged PRs
- Unique contributors
- Open issues

### Repo detail (`/gh-stat/repo/:owner/:repo`)

Shows stats for a single repository:

- **Header:** language, stars, days since last push, stale/archived badge
- **Stat cards:** bus factor, open PR backlog, open issues, contributor count
- **PR velocity table:** total PRs, merge rate, avg time to merge, p50/p90 cycle times, weekly throughput
- **Contributor table:** per-user merged PRs, open PRs, merge rate, lines added/deleted

## Components

All components are exported if you want to embed them individually rather than using the full routed page.

| Component | Description |
|---|---|
| `GhStatPage` | Routable page extension — use this in `<Route>` |
| `OrgDashboard` | Repo list with org filter and summary cards |
| `RepoDashboard` | Per-repo stats (requires router params `:owner`, `:repo`) |
| `PRVelocityCard` | Velocity metrics table, accepts a `PRVelocityStats` prop |
| `ContributorTable` | Contributor breakdown table, accepts a `ContributorStat[]` prop |

## API client

`GhStatClient` communicates with the backend via Backstage's service discovery, so it works in any deployment (local dev, staging, production) without hardcoded URLs.

```ts
import { useGhStatApi } from "@kfang/ghstat-backstage-frontend";

function MyComponent() {
  const api = useGhStatApi();

  useEffect(() => {
    api.getRepos({ org: "my-org" }).then(setRepos);
  }, [api]);
}
```

### `GhStatApi` interface

```ts
interface GhStatApi {
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  getRepoStats(owner: string, repo: string): Promise<RepoStats>;
  getOrgStats(org: string): Promise<OrgRollupStats>;
}
```

`RepoStats` contains `velocity: PRVelocityStats`, `contributors: ContributorStats`, and `health: RepoHealthStats` — see `@kfang/ghstat-stats` for the full type definitions.

## Development

```bash
# from repo root
bun install

# build (Nx builds upstream packages first)
bunx nx run @kfang/ghstat-backstage-frontend:build

# typecheck
bunx nx run @kfang/ghstat-backstage-frontend:typecheck
```

The package uses `jsx: react-jsx` — no `React` import needed in `.tsx` files. Styles are inline `style` props, so there are no CSS files to configure.

To iterate on UI components during development, run the full Backstage dev server (`yarn dev` in your Backstage monorepo) with this package linked via `yarn link` or a path dependency.

## Exports

```ts
// Plugin and routes
export { ghStatPlugin, GhStatPage, rootRouteRef, repoRouteRef };

// API
export { ghStatApiRef, GhStatClient };
export type { GhStatApi, RepoStats };
```
