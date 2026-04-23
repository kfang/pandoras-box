import type { GitHubClient } from "./client.js";
import type { GhRepo } from "./types.js";

export async function fetchRepo(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<GhRepo> {
  const { data } = await client.repos.get({ owner, repo });
  return mapRepo(data);
}

export async function* fetchOrgRepos(
  client: GitHubClient,
  org: string,
): AsyncGenerator<GhRepo> {
  const iter = client.paginate.iterator(client.repos.listForOrg, {
    org,
    type: "all",
    per_page: 100,
  });
  for await (const { data } of iter) {
    for (const repo of data) {
      yield mapRepo(repo);
    }
  }
}

export async function* fetchUserRepos(
  client: GitHubClient,
  username: string,
): AsyncGenerator<GhRepo> {
  const iter = client.paginate.iterator(client.repos.listForUser, {
    username,
    type: "all",
    per_page: 100,
  });
  for await (const { data } of iter) {
    for (const repo of data) {
      yield mapRepo(repo);
    }
  }
}

// Use a loose record type to avoid fighting Octokit's optional-everything generated types.
// The output GhRepo is fully typed; the input is trusted from the GitHub API contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRepo(data: Record<string, any>): GhRepo {
  return {
    id: data.id as number,
    name: data.name as string,
    full_name: data.full_name as string,
    owner: (data.owner as { login: string }).login,
    private: data.private as boolean,
    description: (data.description as string | null) ?? null,
    created_at: (data.created_at as string | null | undefined) ?? "",
    updated_at: (data.updated_at as string | null | undefined) ?? "",
    pushed_at: (data.pushed_at as string | null | undefined) ?? "",
    stargazers_count: (data.stargazers_count as number) ?? 0,
    forks_count: (data.forks_count as number) ?? 0,
    open_issues_count: (data.open_issues_count as number) ?? 0,
    language: (data.language as string | null) ?? null,
    topics: (data.topics as string[] | undefined) ?? [],
    size: (data.size as number) ?? 0,
    watchers_count: (data.watchers_count as number) ?? 0,
    default_branch: (data.default_branch as string) ?? "main",
    archived: (data.archived as boolean) ?? false,
  };
}
