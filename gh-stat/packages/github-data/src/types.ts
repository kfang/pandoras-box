export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics: string[];
  size: number;
  watchers_count: number;
  default_branch: string;
  archived: boolean;
}

export interface GhPullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
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
  draft: boolean;
  labels: string[];
}

export interface FetchPullRequestsOptions {
  state?: "open" | "closed" | "all";
  since?: Date;
  perPage?: number;
}

export interface GhPRComment {
  id: number;
  pr_number: number;
  body: string;
  user_login: string;
  created_at: string;
  updated_at: string;
  /** "issue_comment" = top-level PR thread comment; "review_comment" = inline code comment */
  comment_type: "issue_comment" | "review_comment";
}
