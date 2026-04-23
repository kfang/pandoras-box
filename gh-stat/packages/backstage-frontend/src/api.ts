import { createApiRef, useApi, discoveryApiRef, fetchApiRef } from "@backstage/core-plugin-api";
import type { GhRepo } from "@kfang/ghstat-github-data";
import type {
  PRVelocityStats,
  ContributorStats,
  RepoHealthStats,
  OrgRollupStats,
} from "@kfang/ghstat-stats";

export interface RepoStats {
  repo: string;
  velocity: PRVelocityStats;
  contributors: ContributorStats;
  health: RepoHealthStats;
}

export interface GhStatApi {
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  getRepoStats(owner: string, repo: string): Promise<RepoStats>;
  getOrgStats(org: string): Promise<OrgRollupStats>;
}

export const ghStatApiRef = createApiRef<GhStatApi>({
  id: "plugin.gh-stat.service",
});

export class GhStatClient implements GhStatApi {
  private readonly discoveryApi;
  private readonly fetchApi;

  constructor(options: {
    discoveryApi: typeof discoveryApiRef.T;
    fetchApi: typeof fetchApiRef.T;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl("gh-stat");
  }

  async getRepos(filter?: { org?: string }): Promise<GhRepo[]> {
    const base = await this.baseUrl();
    const url = filter?.org
      ? `${base}/repos?org=${encodeURIComponent(filter.org)}`
      : `${base}/repos`;
    const res = await this.fetchApi.fetch(url);
    return res.json() as Promise<GhRepo[]>;
  }

  async getRepoStats(owner: string, repo: string): Promise<RepoStats> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}/stats/${owner}/${repo}`);
    return res.json() as Promise<RepoStats>;
  }

  async getOrgStats(org: string): Promise<OrgRollupStats> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}/stats/org/${org}`);
    return res.json() as Promise<OrgRollupStats>;
  }
}

// Hook for components
export function useGhStatApi(): GhStatApi {
  return useApi(ghStatApiRef);
}
