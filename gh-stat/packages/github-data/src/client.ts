import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const MAX_RETRIES = 3;

export type GitHubClient = Octokit;

export function createGitHubClient(token: string): GitHubClient {
  // Plugin application is done inline so the complex inferred type stays local.
  const ThrottledOctokit = Octokit.plugin(throttling);
  return new ThrottledOctokit({
    auth: token,
    throttle: {
      // Primary rate limit: x-ratelimit-remaining hit 0.
      // The plugin reads x-ratelimit-reset (or retry-after) and computes retryAfter for us.
      // Returning true tells the plugin to wait retryAfter seconds and then retry.
      onRateLimit: (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        console.warn(
          `Primary rate limit hit for ${options.method} ${options.url}. ` +
          `Waiting ${retryAfter}s before retry ${retryCount + 1}/${MAX_RETRIES}.`,
        );
        return retryCount < MAX_RETRIES;
      },
      // Secondary rate limit: abuse detection (403 with retry-after header).
      // Docs: wait exponentially increasing time between retries, throw after N retries.
      // The plugin waits retryAfter seconds (minimum 60s per GitHub) before the next attempt;
      // we add extra backoff on top by sleeping (2^retryCount - 1) additional minutes.
      onSecondaryRateLimit: async (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
        if (retryCount >= MAX_RETRIES) {
          console.error(
            `Secondary rate limit hit for ${options.method} ${options.url}. ` +
            `Giving up after ${MAX_RETRIES} retries.`,
          );
          return false;
        }
        const extraWaitMs = (2 ** retryCount - 1) * 60_000;
        console.warn(
          `Secondary rate limit hit for ${options.method} ${options.url}. ` +
          `Waiting ${retryAfter}s + ${extraWaitMs / 1000}s backoff (retry ${retryCount + 1}/${MAX_RETRIES}).`,
        );
        if (extraWaitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, extraWaitMs));
        }
        return true;
      },
    },
  }) as Octokit;
}
