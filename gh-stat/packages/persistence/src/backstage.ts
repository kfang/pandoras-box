import type { StorageProvider, GhRepo, GhPullRequest, GhPRComment } from "./types.js";
import { runMigrations, type Migration } from "./migrations.js";

/**
 * Backstage DatabaseService interface (subset used here).
 * The full type comes from @backstage/backend-plugin-api.
 */
export interface BackstageDatabaseService {
  getClient(): Promise<BackstageKnexClient>;
}

export interface BackstageKnexClient {
  schema: {
    hasTable(table: string): Promise<boolean>;
    createTable(table: string, cb: (t: TableBuilder) => void): Promise<void>;
    alterTable(table: string, cb: (t: TableBuilder) => void): Promise<void>;
  };
  raw(sql: string): Promise<void>;
  (table: string): QueryBuilder;
}

interface TableBuilder {
  integer(name: string): ColumnBuilder;
  string(name: string, length?: number): ColumnBuilder;
  text(name: string): ColumnBuilder;
  boolean(name: string): ColumnBuilder;
  timestamps(useTimestamps?: boolean, defaultToNow?: boolean): void;
  primary(columns: string[]): void;
}

interface ColumnBuilder {
  notNullable(): ColumnBuilder;
  nullable(): ColumnBuilder;
  primary(): ColumnBuilder;
  unique(): ColumnBuilder;
  defaultTo(value: unknown): ColumnBuilder;
}

interface QueryBuilder extends Promise<unknown[]> {
  insert(data: Record<string, unknown>): InsertBuilder;
  where(conditions: Record<string, unknown>): QueryBuilder;
  select(...columns: string[]): QueryBuilder;
  orderBy(column: string, direction?: string): QueryBuilder;
  first(): Promise<Record<string, unknown> | undefined>;
  onConflict(column: string | string[]): OnConflictBuilder;
}

interface InsertBuilder extends Promise<unknown> {
  onConflict(column: string | string[]): OnConflictBuilder;
}

interface OnConflictBuilder {
  merge(): Promise<unknown>;
  ignore(): Promise<unknown>;
}

const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    version: 1,
    table: "ghstat_repos",
    sql: `CREATE TABLE ghstat_repos (
      id INTEGER NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL UNIQUE,
      owner TEXT NOT NULL,
      private BOOLEAN NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pushed_at TEXT NOT NULL,
      stargazers_count INTEGER NOT NULL,
      forks_count INTEGER NOT NULL,
      open_issues_count INTEGER NOT NULL,
      language TEXT,
      topics TEXT NOT NULL DEFAULT '[]',
      size INTEGER NOT NULL,
      watchers_count INTEGER NOT NULL,
      default_branch TEXT NOT NULL,
      archived BOOLEAN NOT NULL
    )`,
  },
  {
    version: 2,
    table: "ghstat_pull_requests",
    sql: `CREATE TABLE ghstat_pull_requests (
      id INTEGER NOT NULL,
      repo_full_name TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      state TEXT NOT NULL,
      user_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      merged_at TEXT,
      closed_at TEXT,
      additions INTEGER NOT NULL,
      deletions INTEGER NOT NULL,
      changed_files INTEGER NOT NULL,
      comments INTEGER NOT NULL,
      review_comments INTEGER NOT NULL,
      commits INTEGER NOT NULL,
      draft BOOLEAN NOT NULL,
      labels TEXT NOT NULL DEFAULT '[]',
      PRIMARY KEY (repo_full_name, number)
    )`,
  },
  {
    version: 3,
    table: "ghstat_sync_state",
    sql: `CREATE TABLE ghstat_sync_state (
      repo_full_name TEXT NOT NULL PRIMARY KEY,
      last_sync_time TEXT NOT NULL
    )`,
  },
  {
    version: 4,
    table: "ghstat_pr_comments",
    sql: `CREATE TABLE ghstat_pr_comments (
      id INTEGER NOT NULL,
      comment_type TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      pr_number INTEGER NOT NULL,
      body TEXT NOT NULL,
      user_login TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (id, comment_type)
    )`,
  },
];

export class BackstageStorageProvider implements StorageProvider {
  private dbPromise: Promise<BackstageKnexClient>;

  constructor(database: BackstageDatabaseService) {
    this.dbPromise = this.init(database);
  }

  private async init(database: BackstageDatabaseService): Promise<BackstageKnexClient> {
    const db = await database.getClient();
    await this.migrate(db);
    return db;
  }

  private async migrate(db: BackstageKnexClient): Promise<void> {
    await runMigrations(
      {
        createTrackingTable: async () => {
          if (!(await db.schema.hasTable("ghstat_migrations"))) {
            await db.schema.createTable("ghstat_migrations", (t) => {
              t.integer("version").notNullable().primary();
            });
          }
        },
        tableExists: (name) => db.schema.hasTable(name),
        getAppliedVersions: async () => {
          const rows = (await db("ghstat_migrations").select("version")) as unknown as {
            version: number;
          }[];
          return new Set(rows.map((r) => r.version));
        },
        applyMigration: async (version, sql) => {
          await db.raw(sql);
          await db("ghstat_migrations").insert({ version });
        },
        recordVersion: async (version) => {
          await db("ghstat_migrations").insert({ version }).onConflict("version").ignore();
        },
      },
      MIGRATIONS,
    );
  }

  async saveRepo(repo: GhRepo): Promise<void> {
    const db = await this.dbPromise;
    await db("ghstat_repos")
      .insert({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner,
        private: repo.private,
        description: repo.description,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        open_issues_count: repo.open_issues_count,
        language: repo.language,
        topics: JSON.stringify(repo.topics),
        size: repo.size,
        watchers_count: repo.watchers_count,
        default_branch: repo.default_branch,
        archived: repo.archived,
      })
      .onConflict("full_name")
      .merge();
  }

  async savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void> {
    const db = await this.dbPromise;
    await db("ghstat_pull_requests")
      .insert({
        id: pr.id,
        repo_full_name: repoFullName,
        number: pr.number,
        title: pr.title,
        state: pr.state,
        user_login: pr.user_login,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        closed_at: pr.closed_at,
        additions: pr.additions,
        deletions: pr.deletions,
        changed_files: pr.changed_files,
        comments: pr.comments,
        review_comments: pr.review_comments,
        commits: pr.commits,
        draft: pr.draft,
        labels: JSON.stringify(pr.labels),
      })
      .onConflict(["repo_full_name", "number"])
      .merge();
  }

  async saveComment(comment: GhPRComment, repoFullName: string): Promise<void> {
    const db = await this.dbPromise;
    await db("ghstat_pr_comments")
      .insert({
        id: comment.id,
        comment_type: comment.comment_type,
        repo_full_name: repoFullName,
        pr_number: comment.pr_number,
        body: comment.body,
        user_login: comment.user_login,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
      })
      .onConflict(["id", "comment_type"])
      .merge();
  }

  async getRepos(filter?: { org?: string }): Promise<GhRepo[]> {
    const db = await this.dbPromise;
    let query = db("ghstat_repos").select("*").orderBy("pushed_at", "desc");
    if (filter?.org) {
      query = query.where({ owner: filter.org });
    }
    const rows = (await query) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      name: row["name"] as string,
      full_name: row["full_name"] as string,
      owner: row["owner"] as string,
      private: Boolean(row["private"]),
      description: (row["description"] as string | null) ?? null,
      created_at: row["created_at"] as string,
      updated_at: row["updated_at"] as string,
      pushed_at: row["pushed_at"] as string,
      stargazers_count: row["stargazers_count"] as number,
      forks_count: row["forks_count"] as number,
      open_issues_count: row["open_issues_count"] as number,
      language: (row["language"] as string | null) ?? null,
      topics: JSON.parse(row["topics"] as string) as string[],
      size: row["size"] as number,
      watchers_count: row["watchers_count"] as number,
      default_branch: row["default_branch"] as string,
      archived: Boolean(row["archived"]),
    }));
  }

  async getPullRequests(repoFullName: string): Promise<GhPullRequest[]> {
    const db = await this.dbPromise;
    const rows = (await db("ghstat_pull_requests")
      .select("*")
      .where({ repo_full_name: repoFullName })
      .orderBy("created_at", "desc")) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      number: row["number"] as number,
      title: row["title"] as string,
      state: row["state"] as "open" | "closed",
      user_login: row["user_login"] as string,
      created_at: row["created_at"] as string,
      updated_at: row["updated_at"] as string,
      merged_at: (row["merged_at"] as string | null) ?? null,
      closed_at: (row["closed_at"] as string | null) ?? null,
      additions: row["additions"] as number,
      deletions: row["deletions"] as number,
      changed_files: row["changed_files"] as number,
      comments: row["comments"] as number,
      review_comments: row["review_comments"] as number,
      commits: row["commits"] as number,
      draft: Boolean(row["draft"]),
      labels: JSON.parse(row["labels"] as string) as string[],
    }));
  }

  async getLastSyncTime(repoFullName: string): Promise<Date | null> {
    const db = await this.dbPromise;
    const row = await db("ghstat_sync_state")
      .select("last_sync_time")
      .where({ repo_full_name: repoFullName })
      .first();
    if (!row) return null;
    return new Date(row["last_sync_time"] as string);
  }

  async setLastSyncTime(repoFullName: string, time: Date): Promise<void> {
    const db = await this.dbPromise;
    await db("ghstat_sync_state")
      .insert({ repo_full_name: repoFullName, last_sync_time: time.toISOString() })
      .onConflict("repo_full_name")
      .merge();
  }
}
