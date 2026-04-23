import type { GitHubClient } from "./client.js";
import type { GhPullRequest, FetchPullRequestsOptions } from "./types.js";

export async function* fetchPullRequests(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: FetchPullRequestsOptions = {},
): AsyncGenerator<GhPullRequest> {
  const { state = "all", perPage = 100 } = options;

  const iter = client.paginate.iterator(client.pulls.list, {
    owner,
    repo,
    state,
    sort: "updated",
    direction: "desc",
    per_page: perPage,
  });

  for await (const { data } of iter) {
    for (const pr of data) {
      // Stop pagination if PR is older than `since`
      if (options.since && new Date(pr.updated_at) < options.since) {
        return;
      }

      // Fetch detailed PR data for additions/deletions/changed_files
      const { data: detail } = await client.pulls.get({
        owner,
        repo,
        pull_number: pr.number,
      });

      yield {
        id: detail.id,
        number: detail.number,
        title: detail.title,
        state: detail.state as "open" | "closed",
        user_login: detail.user?.login ?? "",
        created_at: detail.created_at,
        updated_at: detail.updated_at,
        merged_at: detail.merged_at ?? null,
        closed_at: detail.closed_at ?? null,
        additions: detail.additions,
        deletions: detail.deletions,
        changed_files: detail.changed_files,
        comments: detail.comments,
        review_comments: detail.review_comments,
        commits: detail.commits,
        draft: detail.draft ?? false,
        labels: detail.labels.map((l) => l.name),
      };
    }
  }
}
