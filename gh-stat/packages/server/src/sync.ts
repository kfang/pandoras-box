import type { GitHubClient } from "@kfang/ghstat-github-data";
import { fetchRepo, fetchOrgRepos, fetchPullRequests } from "@kfang/ghstat-github-data";
import type { StorageProvider } from "@kfang/ghstat-persistence";
import type { Config } from "./config.js";

export async function syncAll(
  client: GitHubClient,
  storage: StorageProvider,
  config: Config,
): Promise<void> {
  const repoTargets: Array<{ owner: string; repo: string }> = [];

  // Collect individual repos
  for (const fullName of config.github.repos) {
    const [owner, repo] = fullName.split("/");
    if (owner && repo) {
      repoTargets.push({ owner, repo });
    }
  }

  // Collect org repos
  for (const org of config.github.orgs) {
    console.log(`Fetching repos for org: ${org}`);
    for await (const repo of fetchOrgRepos(client, org)) {
      await storage.saveRepo(repo);
      repoTargets.push({ owner: repo.owner, repo: repo.name });
    }
  }

  // Fetch individual repo metadata (for repos not from orgs)
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    // Skip if we already fetched via org (already saved)
    const existing = await storage.getRepos({ org: owner });
    if (!existing.some((r) => r.full_name === fullName)) {
      try {
        console.log(`Fetching repo: ${fullName}`);
        const repoData = await fetchRepo(client, owner, repo);
        await storage.saveRepo(repoData);
      } catch (err) {
        console.error(`Failed to fetch repo ${fullName}:`, err);
      }
    }
  }

  // Fetch pull requests for all repos
  const seen = new Set<string>();
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    if (seen.has(fullName)) continue;
    seen.add(fullName);

    const lastSync = await storage.getLastSyncTime(fullName);
    console.log(
      `Syncing PRs for ${fullName}${lastSync ? ` (since ${lastSync.toISOString()})` : ""}`,
    );

    try {
      for await (const pr of fetchPullRequests(client, owner, repo, {
        state: "all",
        since: lastSync ?? undefined,
      })) {
        await storage.savePullRequest(pr, fullName);
      }
      await storage.setLastSyncTime(fullName, new Date());
    } catch (err) {
      console.error(`Failed to sync PRs for ${fullName}:`, err);
    }
  }

  console.log("Sync complete.");
}
