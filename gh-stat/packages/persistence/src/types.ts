import type { GhRepo, GhPullRequest, GhPRReview, GhPRComment, GhPRTimelineEvent, GhCodeOwnerEntry, GhTeamMember } from "@kfang/ghstat-github-data";

export type { GhRepo, GhPullRequest, GhPRReview, GhPRComment, GhPRTimelineEvent, GhCodeOwnerEntry, GhTeamMember };

export interface StorageProvider {
  /** Upsert a repo record */
  saveRepo(repo: GhRepo): Promise<void>;
  /** Upsert a pull request record */
  savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void>;
  /** Upsert a PR review record */
  saveReview(review: GhPRReview, repoFullName: string): Promise<void>;
  /** Upsert a PR comment record */
  saveComment(comment: GhPRComment, repoFullName: string): Promise<void>;
  /** Get all repos, optionally filtered by org */
  getRepos(filter?: { org?: string }): Promise<GhRepo[]>;
  /** Get all pull requests for a repo */
  getPullRequests(repoFullName: string): Promise<GhPullRequest[]>;
  /** Get reviews, optionally filtered to a single PR */
  getReviews(repoFullName: string, prNumber?: number): Promise<GhPRReview[]>;
  /** Get comments, optionally filtered to a single PR */
  getComments(repoFullName: string, prNumber?: number): Promise<GhPRComment[]>;
  /** Upsert a PR timeline event record */
  saveTimelineEvent(event: GhPRTimelineEvent, repoFullName: string): Promise<void>;
  /** Get timeline events, optionally filtered to a single PR */
  getTimelineEvents(repoFullName: string, prNumber?: number): Promise<GhPRTimelineEvent[]>;
  /** Get the timestamp of the last successful sync for a repo */
  getLastSyncTime(repoFullName: string): Promise<Date | null>;
  /** Record a successful sync timestamp for a repo */
  setLastSyncTime(repoFullName: string, time: Date): Promise<void>;
  /** Get the timestamp of the last time a specific PR's sub-resources were fully synced */
  getPRLastSyncTime(repoFullName: string, prNumber: number): Promise<Date | null>;
  /** Record the time a specific PR's sub-resources were fully synced */
  setPRLastSyncTime(repoFullName: string, prNumber: number, time: Date): Promise<void>;
  /** Replace all CODEOWNERS entries for a repo */
  saveCodeOwnerEntries(repoFullName: string, entries: GhCodeOwnerEntry[]): Promise<void>;
  /** Get CODEOWNERS entries, optionally filtered by repo */
  getCodeOwnerEntries(repoFullName?: string): Promise<Array<GhCodeOwnerEntry & { repo_full_name: string }>>;
  /** Replace all members for a team */
  saveTeamMembers(org: string, teamSlug: string, members: string[]): Promise<void>;
  /** Get member logins for a specific team */
  getTeamMembers(org: string, teamSlug: string): Promise<string[]>;
  /** Get all team memberships */
  getAllTeamMembers(): Promise<GhTeamMember[]>;
}
