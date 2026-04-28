# @kfang/ghstat-github-data

GitHub API client and TypeScript types for raw repository and pull request data. This is the foundational package used by all other `@kfang/ghstat-*` packages.

## Installation

```bash
bun add @kfang/ghstat-github-data
```

## Usage

### Create a client

```ts
import { createGitHubClient } from "@kfang/ghstat-github-data";

const client = createGitHubClient(process.env.GITHUB_TOKEN!);
```

The client wraps `@octokit/rest` with the throttling plugin pre-configured. It automatically retries on rate limit hits (up to 3 times) and backs off on secondary rate limits.

### Fetch a single repository

```ts
import { fetchRepo } from "@kfang/ghstat-github-data";

const repo = await fetchRepo(client, "octocat", "Hello-World");
console.log(repo.full_name, repo.stargazers_count);
```

### Fetch all repositories for an org

```ts
import { fetchOrgRepos } from "@kfang/ghstat-github-data";

for await (const repo of fetchOrgRepos(client, "my-org")) {
  console.log(repo.full_name, repo.pushed_at);
}
```

### Fetch all repositories for a user

```ts
import { fetchUserRepos } from "@kfang/ghstat-github-data";

for await (const repo of fetchUserRepos(client, "octocat")) {
  console.log(repo.full_name);
}
```

### Fetch pull requests

```ts
import { fetchPullRequests } from "@kfang/ghstat-github-data";

// Fetch all PRs
for await (const pr of fetchPullRequests(client, "owner", "repo", { state: "all" })) {
  console.log(pr.number, pr.title, pr.merged_at);
}

// Incremental sync — only PRs updated since a given date
const since = new Date("2024-01-01");
for await (const pr of fetchPullRequests(client, "owner", "repo", { state: "all", since })) {
  console.log(pr.number, pr.updated_at);
}
```

`fetchPullRequests` fetches the detailed PR endpoint for each result to get `additions`, `deletions`, and `changed_files`. This costs one extra API call per PR — use `since` for incremental updates to keep within rate limits.

### Fetch PR comments

```ts
import { fetchPRComments } from "@kfang/ghstat-github-data";

for await (const comment of fetchPRComments(client, "owner", "repo", 42)) {
  console.log(comment.comment_type, comment.user_login, comment.body);
}
```

Returns both issue-style comments (`comment_type: "issue_comment"`) and code review comments (`comment_type: "review_comment"`).

## API

### `createGitHubClient(token: string): GitHubClient`

Creates an Octokit instance with the throttling plugin. Pass a GitHub personal access token (classic or fine-grained). Fine-grained tokens need at least **read access to repository metadata and pull requests**.

### `fetchRepo(client, owner, repo): Promise<GhRepo>`

Fetches a single repository by owner and name.

### `fetchOrgRepos(client, org): AsyncGenerator<GhRepo>`

Paginates through all repositories in an org (`type: "all"`, 100 per page).

### `fetchUserRepos(client, username): AsyncGenerator<GhRepo>`

Paginates through all public/private repositories for a user.

### `fetchPullRequests(client, owner, repo, options?): AsyncGenerator<GhPullRequest>`

Paginates through pull requests, sorted by `updated_at` descending. Stops early if a PR's `updated_at` is older than `options.since`.

**Options:**
| Field | Type | Default | Description |
|---|---|---|---|
| `state` | `"open" \| "closed" \| "all"` | `"all"` | Filter by PR state |
| `since` | `Date` | — | Stop pagination when PRs are older than this date |
| `perPage` | `number` | `100` | Page size |

### `fetchPRComments(client, owner, repo, prNumber): AsyncGenerator<GhPRComment>`

Fetches all comments for a pull request — both issue-level thread comments and inline code review comments.

## Types

### `GhRepo`

| Field | Type | Description |
|---|---|---|
| `id` | `number` | GitHub numeric ID |
| `name` | `string` | Short repo name |
| `full_name` | `string` | `owner/repo` |
| `owner` | `string` | Owner login |
| `private` | `boolean` | |
| `description` | `string \| null` | |
| `created_at` | `string` | ISO 8601 |
| `updated_at` | `string` | ISO 8601 |
| `pushed_at` | `string` | ISO 8601 — last push timestamp |
| `stargazers_count` | `number` | |
| `forks_count` | `number` | |
| `open_issues_count` | `number` | Open issues + open PRs |
| `language` | `string \| null` | Primary language |
| `topics` | `string[]` | |
| `size` | `number` | KB |
| `watchers_count` | `number` | |
| `default_branch` | `string` | |
| `archived` | `boolean` | |

### `GhPullRequest`

| Field | Type | Description |
|---|---|---|
| `id` | `number` | GitHub numeric ID |
| `number` | `number` | PR number within the repo |
| `title` | `string` | |
| `state` | `"open" \| "closed"` | |
| `user_login` | `string` | Author's GitHub login |
| `created_at` | `string` | ISO 8601 |
| `updated_at` | `string` | ISO 8601 |
| `merged_at` | `string \| null` | ISO 8601, or null if not merged |
| `closed_at` | `string \| null` | ISO 8601, or null if open |
| `additions` | `number` | Lines added |
| `deletions` | `number` | Lines removed |
| `changed_files` | `number` | |
| `comments` | `number` | Issue-style comments |
| `review_comments` | `number` | Code review comments |
| `commits` | `number` | |
| `draft` | `boolean` | |
| `labels` | `string[]` | Label names |

### `GhPRComment`

| Field | Type | Description |
|---|---|---|
| `id` | `number` | GitHub numeric ID |
| `comment_type` | `"issue_comment" \| "review_comment"` | |
| `pr_number` | `number` | PR this comment belongs to |
| `body` | `string` | Comment text |
| `user_login` | `string` | Author's GitHub login |
| `created_at` | `string` | ISO 8601 |
| `updated_at` | `string` | ISO 8601 |

## Development

```bash
# from repo root
bun install

# build
bunx nx run @kfang/ghstat-github-data:build

# typecheck
bunx nx run @kfang/ghstat-github-data:typecheck
```

The package targets `ES2022` with `moduleResolution: bundler`. Output goes to `dist/` with declaration maps for source navigation.
