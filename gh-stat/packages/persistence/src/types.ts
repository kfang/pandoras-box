import type { GhRepo, GhPullRequest } from "@kfang/ghstat-github-data";

export type { GhRepo, GhPullRequest };

export interface StorageProvider {
  /** Upsert a repo record */
  saveRepo(repo: GhRepo): Promise<void>;
  /** Upsert a pull request record */
  savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void>;
  /** Get all repos, optionally filtered by org */
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  /** Get all pull requests for a repo */
  getPullRequests(repoFullName: string): Promise<GhPullRequest[]>;
  /** Get the timestamp of the last successful sync for a repo */
  getLastSyncTime(repoFullName: string): Promise<Date | null>;
  /** Record a successful sync timestamp for a repo */
  setLastSyncTime(repoFullName: string, time: Date): Promise<void>;
}
