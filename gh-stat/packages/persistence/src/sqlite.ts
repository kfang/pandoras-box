import { Database } from "bun:sqlite";
import type { StorageProvider, GhRepo, GhPullRequest, GhPRComment } from "./types.js";
import { runMigrationsSync, type Migration } from "./migrations.js";

const MIGRATIONS: ReadonlyArray<Migration> = [
  {
    version: 1,
    table: "repos",
    sql: `CREATE TABLE repos (
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
    table: "pull_requests",
    sql: `CREATE TABLE pull_requests (
      id INTEGER PRIMARY KEY,
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
      UNIQUE (repo_full_name, number)
    )`,
  },
  {
    version: 3,
    table: "sync_state",
    sql: `CREATE TABLE sync_state (
      repo_full_name TEXT PRIMARY KEY,
      last_sync_time TEXT NOT NULL
    )`,
  },
  {
    version: 4,
    table: "pr_comments",
    sql: `CREATE TABLE pr_comments (
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

export class SqliteStorageProvider implements StorageProvider {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL;");
    this.migrate();
  }

  private migrate(): void {
    const db = this.db;
    runMigrationsSync(
      {
        createTrackingTable: () => {
          db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)`);
        },
        tableExists: (name) =>
          !!(db
            .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $n`)
            .get({ $n: name })),
        getAppliedVersions: () =>
          new Set(
            (db.prepare(`SELECT version FROM schema_migrations`).all() as { version: number }[]).map(
              (r) => r.version,
            ),
          ),
        applyMigration: (version, sql) => {
          const run = db.transaction(() => {
            db.exec(sql);
            db.prepare(`INSERT INTO schema_migrations (version) VALUES ($v)`).run({ $v: version });
          });
          run();
        },
        recordVersion: (version) => {
          db.prepare(`INSERT OR IGNORE INTO schema_migrations (version) VALUES ($v)`).run({
            $v: version,
          });
        },
      },
      MIGRATIONS,
    );
  }

  async saveRepo(repo: GhRepo): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO repos (
          id, name, full_name, owner, private, description,
          created_at, updated_at, pushed_at, stargazers_count,
          forks_count, open_issues_count, language, topics, size,
          watchers_count, default_branch, archived
        ) VALUES (
          $id, $name, $full_name, $owner, $private, $description,
          $created_at, $updated_at, $pushed_at, $stargazers_count,
          $forks_count, $open_issues_count, $language, $topics, $size,
          $watchers_count, $default_branch, $archived
        )
        ON CONFLICT(full_name) DO UPDATE SET
          name = excluded.name,
          owner = excluded.owner,
          private = excluded.private,
          description = excluded.description,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          pushed_at = excluded.pushed_at,
          stargazers_count = excluded.stargazers_count,
          forks_count = excluded.forks_count,
          open_issues_count = excluded.open_issues_count,
          language = excluded.language,
          topics = excluded.topics,
          size = excluded.size,
          watchers_count = excluded.watchers_count,
          default_branch = excluded.default_branch,
          archived = excluded.archived
      `)
      .run({
        $id: repo.id,
        $name: repo.name,
        $full_name: repo.full_name,
        $owner: repo.owner,
        $private: repo.private ? 1 : 0,
        $description: repo.description,
        $created_at: repo.created_at,
        $updated_at: repo.updated_at,
        $pushed_at: repo.pushed_at,
        $stargazers_count: repo.stargazers_count,
        $forks_count: repo.forks_count,
        $open_issues_count: repo.open_issues_count,
        $language: repo.language,
        $topics: JSON.stringify(repo.topics),
        $size: repo.size,
        $watchers_count: repo.watchers_count,
        $default_branch: repo.default_branch,
        $archived: repo.archived ? 1 : 0,
      });
  }

  async savePullRequest(pr: GhPullRequest, repoFullName: string): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO pull_requests (
          id, repo_full_name, number, title, state, user_login,
          created_at, updated_at, merged_at, closed_at,
          additions, deletions, changed_files, comments,
          review_comments, commits, draft, labels
        ) VALUES (
          $id, $repo_full_name, $number, $title, $state, $user_login,
          $created_at, $updated_at, $merged_at, $closed_at,
          $additions, $deletions, $changed_files, $comments,
          $review_comments, $commits, $draft, $labels
        )
        ON CONFLICT(repo_full_name, number) DO UPDATE SET
          title = excluded.title,
          state = excluded.state,
          updated_at = excluded.updated_at,
          merged_at = excluded.merged_at,
          closed_at = excluded.closed_at,
          additions = excluded.additions,
          deletions = excluded.deletions,
          changed_files = excluded.changed_files,
          comments = excluded.comments,
          review_comments = excluded.review_comments,
          commits = excluded.commits,
          draft = excluded.draft,
          labels = excluded.labels
      `)
      .run({
        $id: pr.id,
        $repo_full_name: repoFullName,
        $number: pr.number,
        $title: pr.title,
        $state: pr.state,
        $user_login: pr.user_login,
        $created_at: pr.created_at,
        $updated_at: pr.updated_at,
        $merged_at: pr.merged_at,
        $closed_at: pr.closed_at,
        $additions: pr.additions,
        $deletions: pr.deletions,
        $changed_files: pr.changed_files,
        $comments: pr.comments,
        $review_comments: pr.review_comments,
        $commits: pr.commits,
        $draft: pr.draft ? 1 : 0,
        $labels: JSON.stringify(pr.labels),
      });
  }

  async saveComment(comment: GhPRComment, repoFullName: string): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO pr_comments (id, comment_type, repo_full_name, pr_number, body, user_login, created_at, updated_at)
        VALUES ($id, $comment_type, $repo_full_name, $pr_number, $body, $user_login, $created_at, $updated_at)
        ON CONFLICT(id, comment_type) DO UPDATE SET
          body = excluded.body,
          updated_at = excluded.updated_at
      `)
      .run({
        $id: comment.id,
        $comment_type: comment.comment_type,
        $repo_full_name: repoFullName,
        $pr_number: comment.pr_number,
        $body: comment.body,
        $user_login: comment.user_login,
        $created_at: comment.created_at,
        $updated_at: comment.updated_at,
      });
  }

  async getRepos(filter?: { org?: string }): Promise<GhRepo[]> {
    let rows: unknown[];
    if (filter?.org) {
      rows = this.db
        .prepare("SELECT * FROM repos WHERE owner = $owner ORDER BY pushed_at DESC")
        .all({ $owner: filter.org });
    } else {
      rows = this.db.prepare("SELECT * FROM repos ORDER BY pushed_at DESC").all();
    }
    return (rows as RepoRow[]).map(rowToRepo);
  }

  async getPullRequests(repoFullName: string): Promise<GhPullRequest[]> {
    const rows = this.db
      .prepare(
        "SELECT * FROM pull_requests WHERE repo_full_name = $repo ORDER BY created_at DESC",
      )
      .all({ $repo: repoFullName });
    return (rows as PrRow[]).map(rowToPr);
  }

  async getLastSyncTime(repoFullName: string): Promise<Date | null> {
    const row = this.db
      .prepare("SELECT last_sync_time FROM sync_state WHERE repo_full_name = $repo")
      .get({ $repo: repoFullName }) as { last_sync_time: string } | null;
    return row ? new Date(row.last_sync_time) : null;
  }

  async setLastSyncTime(repoFullName: string, time: Date): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO sync_state (repo_full_name, last_sync_time)
        VALUES ($repo, $time)
        ON CONFLICT(repo_full_name) DO UPDATE SET last_sync_time = excluded.last_sync_time
      `)
      .run({ $repo: repoFullName, $time: time.toISOString() });
  }
}

interface RepoRow {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string;
  size: number;
  watchers_count: number;
  default_branch: string;
  archived: number;
}

interface PrRow {
  id: number;
  repo_full_name: string;
  number: number;
  title: string;
  state: string;
  user_login: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  comments: number;
  review_comments: number;
  commits: number;
  draft: number;
  labels: string;
}

function rowToRepo(row: RepoRow): GhRepo {
  return {
    id: row.id,
    name: row.name,
    full_name: row.full_name,
    owner: row.owner,
    private: row.private === 1,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pushed_at: row.pushed_at,
    stargazers_count: row.stargazers_count,
    forks_count: row.forks_count,
    open_issues_count: row.open_issues_count,
    language: row.language,
    topics: JSON.parse(row.topics) as string[],
    size: row.size,
    watchers_count: row.watchers_count,
    default_branch: row.default_branch,
    archived: row.archived === 1,
  };
}

function rowToPr(row: PrRow): GhPullRequest {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    state: row.state as "open" | "closed",
    user_login: row.user_login,
    created_at: row.created_at,
    updated_at: row.updated_at,
    merged_at: row.merged_at,
    closed_at: row.closed_at,
    additions: row.additions,
    deletions: row.deletions,
    changed_files: row.changed_files,
    comments: row.comments,
    review_comments: row.review_comments,
    commits: row.commits,
    draft: row.draft === 1,
    labels: JSON.parse(row.labels) as string[],
  };
}
