export type { GhRepo, GhPullRequest, GhPRComment, FetchPullRequestsOptions } from "./types.js";
export { createGitHubClient } from "./client.js";
export type { GitHubClient } from "./client.js";
export { fetchRepo, fetchOrgRepos, fetchUserRepos } from "./repos.js";
export { fetchPullRequests, fetchPRComments } from "./pulls.js";
