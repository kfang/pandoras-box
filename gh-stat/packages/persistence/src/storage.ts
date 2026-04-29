import knex, { type Knex } from "knex";
import type { StorageProvider, GhRepo, GhPullRequest, GhPRReview, GhPRComment } from "./types.js";

interface Migration {
  version: number;
  /** Name of the table created by this migration — used to baseline pre-existing databases. */
  table: string;
  sql: string;
}

/** Backstage DatabaseService interface (subset used here). */
export interface BackstageDatabaseService {
  getClient(): Promise<Knex>;
}

interface TableNames {
  repos: string;
  pullRequests: string;
  syncState: string;
  prComments: string;
  prReviews: string;
  migrations: string;
}

function withPrefix(p: string): TableNames {
  return {
    repos: `${p}repos`,
    pullRequests: `${p}pull_requests`,
    syncState: `${p}sync_state`,
    prComments: `${p}pr_comments`,
    prReviews: `${p}pr_reviews`,
    migrations: `${p}schema_migrations`,
  };
}

export class KnexStorageProvider implements StorageProvider {
  private readonly t: TableNames;
  private readonly dbPromise: Promise<Knex>;

  constructor(db: Knex | Promise<Knex>, tablePrefix = "") {
    this.t = withPrefix(tablePrefix);
    this.dbPromise = Promise.resolve(db).then((d) => this.migrate(d).then(() => d));
  }

  private buildMigrations(): ReadonlyArray<Migration> {
    const { repos, pullRequests, syncState, prComments, prReviews } = this.t;
    return [
      {
        version: 1,
        table: repos,
        sql: `CREATE TABLE ${repos} (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          full_name TEXT NOT NULL UNIQUE,
          owner TEXT NOT NULL,
          private INTEGER NOT NULL,
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
          archived INTEGER NOT NULL
        )`,
      },
      {
        version: 2,
        table: pullRequests,
        sql: `CREATE TABLE ${pullRequests} (
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
          draft INTEGER NOT NULL,
          labels TEXT NOT NULL DEFAULT '[]',
          PRIMARY KEY (repo_full_name, number)
        )`,
      },
      {
        version: 3,
        table: syncState,
        sql: `CREATE TABLE ${syncState} (
          repo_full_name TEXT NOT NULL PRIMARY KEY,
          last_sync_time TEXT NOT NULL
        )`,
      },
      {
        version: 4,
        table: prComments,
        sql: `CREATE TABLE ${prComments} (
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
      {
        version: 5,
        table: prReviews,
        sql: `CREATE TABLE ${prReviews} (
          id INTEGER NOT NULL PRIMARY KEY,
          repo_full_name TEXT NOT NULL,
          pr_number INTEGER NOT NULL,
          user_login TEXT NOT NULL,
          state TEXT NOT NULL,
          body TEXT NOT NULL,
          submitted_at TEXT NOT NULL
        )`,
      },
    ];
  }

  private async migrate(db: Knex): Promise<void> {
    const { migrations } = this.t;
    const steps = this.buildMigrations();

    if (!(await db.schema.hasTable(migrations))) {
      await db.schema.createTable(migrations, (t) => {
        t.integer("version").notNullable().primary();
      });
    }

    const applied = new Set(
      ((await db(migrations).select("version")) as { version: number }[]).map((r) => r.version),
    );

    if (applied.size === 0) {
      for (const { version, table } of steps) {
        if (await db.schema.hasTable(table)) {
          await db(migrations).insert({ version }).onConflict("version").ignore();
          applied.add(version);
        }
      }
    }

    for (const { version, sql } of steps) {
      if (!applied.has(version)) {
        await db.transaction(async (trx) => {
          await trx.raw(sql);
          await trx(migrations).insert({ version });
        });
      }
    }
  }

  async saveRepo(repo: GhRepo): Promise<void> {
    const db = await this.dbPromise;
    await db(this.t.repos)
      .insert({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        owner: repo.owner,
        private: repo.private ? 1 : 0,
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
        archived: repo.archived ? 1 : 0,
      })
      .onConflict("full_name")
      .merge();
  }

  async savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void> {
    const db = await this.dbPromise;
    await db(this.t.pullRequests)
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
        draft: pr.draft ? 1 : 0,
        labels: JSON.stringify(pr.labels),
      })
      .onConflict(["repo_full_name", "number"])
      .merge();
  }

  async saveComment(comment: GhPRComment, repoFullName: string): Promise<void> {
    const db = await this.dbPromise;
    await db(this.t.prComments)
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

  async saveReview(review: GhPRReview, repoFullName: string): Promise<void> {
    const db = await this.dbPromise;
    await db(this.t.prReviews)
      .insert({
        id: review.id,
        repo_full_name: repoFullName,
        pr_number: review.pr_number,
        user_login: review.user_login,
        state: review.state,
        body: review.body,
        submitted_at: review.submitted_at,
      })
      .onConflict("id")
      .merge();
  }

  async getRepos(filter?: { org?: string }): Promise<GhRepo[]> {
    const db = await this.dbPromise;
    let query = db(this.t.repos).select("*").orderBy("pushed_at", "desc");
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
    const rows = (await db(this.t.pullRequests)
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

  async getReviews(repoFullName: string, prNumber?: number): Promise<GhPRReview[]> {
    const db = await this.dbPromise;
    let query = db(this.t.prReviews)
      .select("*")
      .where({ repo_full_name: repoFullName })
      .orderBy("submitted_at", "asc");
    if (prNumber !== undefined) {
      query = query.where({ pr_number: prNumber });
    }
    const rows = (await query) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      pr_number: row["pr_number"] as number,
      user_login: row["user_login"] as string,
      state: row["state"] as GhPRReview["state"],
      body: row["body"] as string,
      submitted_at: row["submitted_at"] as string,
    }));
  }

  async getComments(repoFullName: string, prNumber?: number): Promise<GhPRComment[]> {
    const db = await this.dbPromise;
    let query = db(this.t.prComments)
      .select("*")
      .where({ repo_full_name: repoFullName })
      .orderBy("created_at", "asc");
    if (prNumber !== undefined) {
      query = query.where({ pr_number: prNumber });
    }
    const rows = (await query) as unknown as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row["id"] as number,
      pr_number: row["pr_number"] as number,
      body: row["body"] as string,
      user_login: row["user_login"] as string,
      created_at: row["created_at"] as string,
      updated_at: row["updated_at"] as string,
      comment_type: row["comment_type"] as GhPRComment["comment_type"],
    }));
  }

  async getLastSyncTime(repoFullName: string): Promise<Date | null> {
    const db = await this.dbPromise;
    const row = await db(this.t.syncState)
      .select("last_sync_time")
      .where({ repo_full_name: repoFullName })
      .first();
    if (!row) return null;
    return new Date(row["last_sync_time"] as string);
  }

  async setLastSyncTime(repoFullName: string, time: Date): Promise<void> {
    const db = await this.dbPromise;
    await db(this.t.syncState)
      .insert({ repo_full_name: repoFullName, last_sync_time: time.toISOString() })
      .onConflict("repo_full_name")
      .merge();
  }
}

export function createSqliteProvider(path: string): KnexStorageProvider {
  const db = (async () => {
    const instance = knex({
      client: "better-sqlite3",
      connection: { filename: path },
      useNullAsDefault: true,
    });
    await instance.raw("PRAGMA journal_mode=WAL");
    return instance;
  })();
  return new KnexStorageProvider(db);
}

export function createBackstageProvider(database: BackstageDatabaseService): KnexStorageProvider {
  return new KnexStorageProvider(database.getClient(), "ghstat_");
}
