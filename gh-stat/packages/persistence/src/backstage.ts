import type { StorageProvider, GhRepo, GhPullRequest } from "./types.js";

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
  };
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
    if (!(await db.schema.hasTable("ghstat_repos"))) {
      await db.schema.createTable("ghstat_repos", (t) => {
        t.integer("id").notNullable().primary();
        t.string("name").notNullable();
        t.string("full_name").notNullable().unique();
        t.string("owner").notNullable();
        t.boolean("private").notNullable();
        t.text("description").nullable();
        t.string("created_at").notNullable();
        t.string("updated_at").notNullable();
        t.string("pushed_at").notNullable();
        t.integer("stargazers_count").notNullable();
        t.integer("forks_count").notNullable();
        t.integer("open_issues_count").notNullable();
        t.string("language").nullable();
        t.text("topics").notNullable().defaultTo("[]");
        t.integer("size").notNullable();
        t.integer("watchers_count").notNullable();
        t.string("default_branch").notNullable();
        t.boolean("archived").notNullable();
      });
    }

    if (!(await db.schema.hasTable("ghstat_pull_requests"))) {
      await db.schema.createTable("ghstat_pull_requests", (t) => {
        t.integer("id").notNullable();
        t.string("repo_full_name").notNullable();
        t.integer("number").notNullable();
        t.text("title").notNullable();
        t.string("state").notNullable();
        t.string("user_login").notNullable();
        t.string("created_at").notNullable();
        t.string("updated_at").notNullable();
        t.string("merged_at").nullable();
        t.string("closed_at").nullable();
        t.integer("additions").notNullable();
        t.integer("deletions").notNullable();
        t.integer("changed_files").notNullable();
        t.integer("comments").notNullable();
        t.integer("review_comments").notNullable();
        t.integer("commits").notNullable();
        t.boolean("draft").notNullable();
        t.text("labels").notNullable().defaultTo("[]");
        t.primary(["repo_full_name", "number"]);
      });
    }

    if (!(await db.schema.hasTable("ghstat_sync_state"))) {
      await db.schema.createTable("ghstat_sync_state", (t) => {
        t.string("repo_full_name").notNullable().primary();
        t.string("last_sync_time").notNullable();
      });
    }
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
