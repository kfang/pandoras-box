export type { GhRepo, GhPullRequest, FetchPullRequestsOptions } from "./types.js";
export { createGitHubClient } from "./client.js";
export type { GitHubClient } from "./client.js";
export { fetchRepo, fetchOrgRepos, fetchUserRepos } from "./repos.js";
export { fetchPullRequests } from "./pulls.js";
