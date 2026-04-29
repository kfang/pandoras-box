import type { GitHubClient } from "@kfang/ghstat-github-data";
import { fetchRepo, fetchOrgRepos, fetchPullRequests, fetchPRComments, fetchPRReviews } from "@kfang/ghstat-github-data";
import type { StorageProvider } from "./types.js";

export interface SyncConfig {
  github: {
    orgs: string[];
    repos: string[];
  };
}

/** Minimal logger interface — compatible with console, Backstage LoggerService, and winston. */
export interface SyncLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export async function syncAll(
  client: GitHubClient,
  storage: StorageProvider,
  config: SyncConfig,
  logger: SyncLogger = console,
): Promise<void> {
  const repoTargets: Array<{ owner: string; repo: string }> = [];

  // Collect org repos first — saves them to storage as they are discovered
  for (const org of config.github.orgs) {
    logger.info(`Fetching repos for org: ${org}`);
    for await (const repo of fetchOrgRepos(client, org)) {
      await storage.saveRepo(repo);
      repoTargets.push({ owner: repo.owner, repo: repo.name });
    }
  }

  // Collect individually listed repos
  for (const fullName of config.github.repos) {
    const [owner, repo] = fullName.split("/");
    if (owner && repo) {
      repoTargets.push({ owner, repo });
    }
  }

  // Fetch metadata for individually listed repos that weren't already saved via an org
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    const existing = await storage.getRepos({ org: owner });
    if (!existing.some((r) => r.full_name === fullName)) {
      try {
        logger.info(`Fetching repo: ${fullName}`);
        await storage.saveRepo(await fetchRepo(client, owner, repo));
      } catch (err) {
        logger.error(`Failed to fetch repo ${fullName}`, err);
      }
    }
  }

  // Sync pull requests for all repos, deduplicating across orgs + individual listings
  const seen = new Set<string>();
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    if (seen.has(fullName)) continue;
    seen.add(fullName);

    const lastSync = await storage.getLastSyncTime(fullName);
    logger.info(
      `Syncing PRs for ${fullName}${lastSync ? ` (since ${lastSync.toISOString()})` : ""}`,
    );

    try {
      for await (const pr of fetchPullRequests(client, owner, repo, {
        state: "all",
        since: lastSync ?? undefined,
      })) {
        await storage.savePullRequest(pr, fullName);

        try {
          for await (const comment of fetchPRComments(client, owner, repo, pr.number)) {
            await storage.saveComment(comment, fullName);
          }
        } catch (err) {
          logger.error(`Failed to sync comments for ${fullName}#${pr.number}`, err);
        }

        try {
          for await (const review of fetchPRReviews(client, owner, repo, pr.number)) {
            await storage.saveReview(review, fullName);
          }
        } catch (err) {
          logger.error(`Failed to sync reviews for ${fullName}#${pr.number}`, err);
        }
      }
      await storage.setLastSyncTime(fullName, new Date());
    } catch (err) {
      logger.error(`Failed to sync PRs for ${fullName}`, err);
    }
  }

  logger.info("Sync complete.");
}
