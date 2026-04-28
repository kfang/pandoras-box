# @kfang/ghstat-stats

Pure statistical calculation functions for `gh-stat`. Takes arrays of `GhRepo` and `GhPullRequest` objects and returns plain serializable result objects. No I/O, no side effects — easy to unit test and compose.

## Installation

```bash
bun add @kfang/ghstat-stats @kfang/ghstat-github-data
```

## Usage

All functions take data you've already fetched and stored. Pair with `@kfang/ghstat-persistence` to load data, then pass it through these functions.

### PR velocity

```ts
import { calcPRVelocity } from "@kfang/ghstat-stats";

const prs = await storage.getPullRequests("owner/my-repo");
const velocity = calcPRVelocity(prs);

console.log(`Merged: ${velocity.mergedPRs} / ${velocity.totalPRs}`);
console.log(`Merge rate: ${(velocity.mergeRate * 100).toFixed(1)}%`);
console.log(`Avg time to merge: ${velocity.avgTimeToMergeLabel}`); // e.g. "2.3d"
console.log(`p50 cycle time: ${velocity.p50CycleTimeMs}ms`);
console.log(`Weekly throughput: ${velocity.weeklyThroughput?.toFixed(1)} PRs/wk`);
```

### Contributor stats

```ts
import { calcContributorStats } from "@kfang/ghstat-stats";

const prs = await storage.getPullRequests("owner/my-repo");
const { contributors, topContributor } = calcContributorStats(prs);

console.log(`Top contributor: ${topContributor}`);
for (const c of contributors) {
  console.log(`${c.login}: ${c.mergedPRs} merged, ${(c.mergeRate * 100).toFixed(0)}% merge rate`);
}
```

### Repo health

```ts
import { calcRepoHealth } from "@kfang/ghstat-stats";

const repos = await storage.getRepos({ org: "my-org" });
const prs = await storage.getPullRequests("my-org/my-repo");
const health = calcRepoHealth(repos[0]!, prs);

console.log(`Days since push: ${health.daysSinceLastPush}`);
console.log(`Stale: ${health.isStale}`);         // true if 90+ days
console.log(`Bus factor: ${health.busFactor}`);   // contributors with ≥10% of merged PRs
console.log(`Open PR backlog: ${health.openPRBacklog}`);
```

You can pass a custom `now` date as the third argument (useful for testing):

```ts
const health = calcRepoHealth(repo, prs, new Date("2024-06-01"));
```

### Org rollups

```ts
import { calcOrgRollups } from "@kfang/ghstat-stats";
import type { GhPullRequest } from "@kfang/ghstat-github-data";

const repos = await storage.getRepos({ org: "my-org" });
const prsByRepo = new Map<string, GhPullRequest[]>();
for (const repo of repos) {
  prsByRepo.set(repo.full_name, await storage.getPullRequests(repo.full_name));
}

const rollup = calcOrgRollups(repos, prsByRepo, "my-org");

console.log(`Total repos: ${rollup.totalRepos} (${rollup.activeRepos} active)`);
console.log(`Total merged PRs: ${rollup.totalMergedPRs}`);
console.log(`Unique contributors: ${rollup.uniqueContributors}`);
console.log("Top repos:", rollup.topReposByActivity);
console.log("Top contributors:", rollup.topContributors);
console.log("Languages:", rollup.languages);
```

## API

### `calcPRVelocity(prs: GhPullRequest[]): PRVelocityStats`

| Field | Type | Description |
|---|---|---|
| `totalPRs` | `number` | All PRs in the input |
| `mergedPRs` | `number` | PRs with `merged_at !== null` |
| `openPRs` | `number` | PRs with `state === "open"` |
| `closedUnmergedPRs` | `number` | Closed but not merged |
| `mergeRate` | `number` | `mergedPRs / totalPRs`, 0–1 |
| `avgTimeToMergeMs` | `number \| null` | Mean cycle time in ms |
| `avgTimeToMergeLabel` | `string \| null` | Human label: `"2.3h"`, `"1.4d"`, `"2.1w"` |
| `p50CycleTimeMs` | `number \| null` | Median cycle time in ms |
| `p90CycleTimeMs` | `number \| null` | p90 cycle time in ms |
| `weeklyThroughput` | `number \| null` | Merged PRs per week over the observed window |
| `windowStart` | `string \| null` | ISO date of oldest PR |
| `windowEnd` | `string \| null` | ISO date of newest PR |

Cycle time is measured from `created_at` to `merged_at`. PRs with negative cycle times (data anomalies) are excluded from percentile calculations.

---

### `calcContributorStats(prs: GhPullRequest[]): ContributorStats`

| Field | Type | Description |
|---|---|---|
| `contributors` | `ContributorStat[]` | Per-user stats, sorted by `mergedPRs` descending |
| `uniqueContributors` | `number` | |
| `topContributor` | `string \| null` | Login of highest `mergedPRs` contributor |

**`ContributorStat` fields:** `login`, `totalPRs`, `mergedPRs`, `openPRs`, `closedUnmergedPRs`, `mergeRate`, `totalAdditions`, `totalDeletions`, `totalChangedFiles`

---

### `calcRepoHealth(repo: GhRepo, prs: GhPullRequest[], now?: Date): RepoHealthStats`

| Field | Type | Description |
|---|---|---|
| `repoFullName` | `string` | `owner/repo` |
| `language` | `string \| null` | Primary language |
| `daysSinceLastPush` | `number` | Days since `pushed_at` |
| `isStale` | `boolean` | `daysSinceLastPush >= 90` |
| `openPRBacklog` | `number` | Open PRs in the input set |
| `openIssues` | `number` | From `repo.open_issues_count` (GitHub's counter) |
| `busFactor` | `number` | Contributors responsible for ≥10% of merged PRs |
| `stars` | `number` | |
| `forks` | `number` | |
| `archived` | `boolean` | |
| `topics` | `string[]` | |

---

### `calcOrgRollups(repos: GhRepo[], prsByRepo: Map<string, GhPullRequest[]>, org: string): OrgRollupStats`

| Field | Type | Description |
|---|---|---|
| `org` | `string` | |
| `totalRepos` | `number` | |
| `activeRepos` | `number` | Non-archived repos |
| `archivedRepos` | `number` | |
| `totalStars` | `number` | Sum across all repos |
| `totalForks` | `number` | |
| `totalOpenIssues` | `number` | |
| `totalPRs` | `number` | Across all repos |
| `totalMergedPRs` | `number` | |
| `totalOpenPRs` | `number` | |
| `uniqueContributors` | `number` | Unique authors across all repos |
| `topReposByActivity` | `Array<{ repoFullName, mergedPRs }>` | Top 5 by merged PRs |
| `topContributors` | `Array<{ login, mergedPRs }>` | Top 5 across org |
| `languages` | `Array<{ language, repoCount }>` | Sorted by repo count |

## Development

```bash
# from repo root
bun install

# build (Nx builds upstream packages first)
bunx nx run @kfang/ghstat-stats:build

# typecheck
bunx nx run @kfang/ghstat-stats:typecheck
```

Because all functions are pure, they are straightforward to unit test — pass in fixture arrays of `GhPullRequest` / `GhRepo` objects and assert on the result.
