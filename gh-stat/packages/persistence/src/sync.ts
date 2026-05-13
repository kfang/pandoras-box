import type { GitHubClient } from "@kfang/ghstat-github-data";
import { fetchRepo, fetchOrgRepos, fetchPullRequests, fetchPRComments, fetchPRReviews, fetchPRTimelineEvents } from "@kfang/ghstat-github-data";
import type { StorageProvider } from "./types.js";

export interface SyncConfig {
  github: {
    orgs: string[];
    repos: string[];
    /** How many days back to fetch PRs on the first (full) sync. Omit to fetch all history. */
    lookback_days?: number;
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
  const startedAt = Date.now();
  const repoTargets: Array<{ owner: string; repo: string }> = [];

  // Collect org repos first — saves them to storage as they are discovered
  for (const org of config.github.orgs) {
    logger.info(`[sync] Fetching repos for org: ${org}`);
    let orgRepoCount = 0;
    let orgArchivedCount = 0;
    for await (const repo of fetchOrgRepos(client, org)) {
      await storage.saveRepo(repo);
      if (repo.archived) {
        orgArchivedCount++;
        logger.info(`[sync]   Skipping archived repo: ${repo.full_name}`);
      } else {
        orgRepoCount++;
        repoTargets.push({ owner: repo.owner, repo: repo.name });
      }
    }
    logger.info(`[sync] Org ${org}: found ${orgRepoCount} active repo(s), skipped ${orgArchivedCount} archived`);
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
        logger.info(`[sync] Fetching metadata for repo: ${fullName}`);
        await storage.saveRepo(await fetchRepo(client, owner, repo));
      } catch (err) {
        logger.error(`[sync] Failed to fetch repo ${fullName}`, err);
      }
    }
  }

  // Sync pull requests for all repos, deduplicating across orgs + individual listings
  const seen = new Set<string>();
  let totalPRs = 0;
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    if (seen.has(fullName)) {
      logger.info(`[sync] Skipping duplicate repo: ${fullName}`);
      continue;
    }
    seen.add(fullName);

    const lastSync = await storage.getLastSyncTime(fullName);
    const lookbackSince = config.github.lookback_days !== undefined
      ? new Date(Date.now() - config.github.lookback_days * 86_400_000)
      : undefined;
    const since = lastSync ?? lookbackSince;
    logger.info(
      `[sync] Syncing ${fullName}` +
      (lastSync ? ` (incremental since ${lastSync.toISOString()})` :
        lookbackSince ? ` (full, lookback ${config.github.lookback_days}d since ${lookbackSince.toISOString()})` :
        " (full, all history)"),
    );

    try {
      let prCount = 0;
      for await (const pr of fetchPullRequests(client, owner, repo, {
        state: "all",
        since,
      })) {
        prCount++;
        totalPRs++;
        await storage.savePullRequest(pr, fullName);

        const prLastSync = await storage.getPRLastSyncTime(fullName, pr.number);
        if (prLastSync && new Date(pr.updated_at) <= prLastSync) {
          logger.info(`[sync]   PR #${pr.number} "${pr.title}" (${pr.state}) — unchanged since ${prLastSync.toISOString()}, skipping`);
          continue;
        }

        logger.info(`[sync]   PR #${pr.number} "${pr.title}" (${pr.state})`);

        try {
          let commentCount = 0;
          for await (const comment of fetchPRComments(client, owner, repo, pr.number)) {
            await storage.saveComment(comment, fullName);
            commentCount++;
          }
          logger.info(`[sync]     ${commentCount} comment(s)`);
        } catch (err) {
          logger.error(`[sync]     Failed to sync comments for ${fullName}#${pr.number}`, err);
        }

        try {
          let reviewCount = 0;
          for await (const review of fetchPRReviews(client, owner, repo, pr.number)) {
            await storage.saveReview(review, fullName);
            reviewCount++;
          }
          logger.info(`[sync]     ${reviewCount} review(s)`);
        } catch (err) {
          logger.error(`[sync]     Failed to sync reviews for ${fullName}#${pr.number}`, err);
        }

        try {
          let eventCount = 0;
          for await (const event of fetchPRTimelineEvents(client, owner, repo, pr.number)) {
            await storage.saveTimelineEvent(event, fullName);
            eventCount++;
          }
          logger.info(`[sync]     ${eventCount} timeline event(s)`);

          // Compute ready_for_review_at from saved timeline events
          const events = await storage.getTimelineEvents(fullName, pr.number);
          const readyEvent = events
            .filter((e) => e.event === "ready_for_review")
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          if (readyEvent) {
            logger.info(`[sync]     ready_for_review_at: ${readyEvent.created_at}`);
            await storage.savePullRequest(
              { ...pr, ready_for_review_at: readyEvent.created_at },
              fullName,
            );
          }
        } catch (err) {
          logger.error(`[sync]     Failed to sync timeline events for ${fullName}#${pr.number}`, err);
        }

        await storage.setPRLastSyncTime(fullName, pr.number, new Date());
      }

      await storage.setLastSyncTime(fullName, new Date());
      logger.info(`[sync] Finished ${fullName}: ${prCount} PR(s) synced`);
    } catch (err) {
      logger.error(`[sync] Failed to sync ${fullName}`, err);
    }
  }

  const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(`[sync] Complete — ${totalPRs} PR(s) across ${seen.size} repo(s) in ${elapsedS}s`);
}
