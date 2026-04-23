import type { GitHubClient } from "@kfang/ghstat-github-data";
import { fetchRepo, fetchOrgRepos, fetchPullRequests } from "@kfang/ghstat-github-data";
import type { StorageProvider } from "@kfang/ghstat-persistence";

interface SyncConfig {
  github: {
    orgs: string[];
    repos: string[];
  };
}

export async function syncAll(
  client: GitHubClient,
  storage: StorageProvider,
  config: SyncConfig,
): Promise<void> {
  const repoTargets: Array<{ owner: string; repo: string }> = [];

  for (const org of config.github.orgs) {
    for await (const repo of fetchOrgRepos(client, org)) {
      await storage.saveRepo(repo);
      repoTargets.push({ owner: repo.owner, repo: repo.name });
    }
  }

  for (const fullName of config.github.repos) {
    const [owner, repo] = fullName.split("/");
    if (owner && repo) {
      repoTargets.push({ owner, repo });
    }
  }

  const seen = new Set<string>();
  for (const { owner, repo } of repoTargets) {
    const fullName = `${owner}/${repo}`;
    if (seen.has(fullName)) continue;
    seen.add(fullName);

    // Save individual repo if not already saved via org
    const existing = await storage.getRepos({ org: owner });
    if (!existing.some((r) => r.full_name === fullName)) {
      try {
        await storage.saveRepo(await fetchRepo(client, owner, repo));
      } catch {
        // ignore
      }
    }

    const lastSync = await storage.getLastSyncTime(fullName);
    for await (const pr of fetchPullRequests(client, owner, repo, {
      state: "all",
      since: lastSync ?? undefined,
    })) {
      await storage.savePullRequest(pr, fullName);
    }
    await storage.setLastSyncTime(fullName, new Date());
  }
}
