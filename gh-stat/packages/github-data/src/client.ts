import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

export type GitHubClient = Octokit;

export function createGitHubClient(token: string): GitHubClient {
  // Plugin application is done inline so the complex inferred type stays local.
  const ThrottledOctokit = Octokit.plugin(throttling);
  return new ThrottledOctokit({
    auth: token,
    throttle: {
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(`Rate limit hit for ${options.method} ${options.url}. Retry after ${retryAfter}s.`);
        return retryCount < 3;
      },
      onSecondaryRateLimit: (retryAfter: number, options: { method: string; url: string }) => {
        console.warn(`Secondary rate limit hit for ${options.method} ${options.url}. Retry after ${retryAfter}s.`);
        return false;
      },
    },
  }) as Octokit;
}
