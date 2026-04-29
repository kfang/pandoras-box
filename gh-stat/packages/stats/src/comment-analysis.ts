import type { GhPullRequest, GhPRComment } from "@kfang/ghstat-github-data";

export interface CommentAnalysisStats {
  totalComments: number;
  issueComments: number;
  reviewComments: number;
  /** Unique commenters excluding PR authors */
  uniqueExternalCommenters: number;
  avgCommentsPerPR: number | null;
  avgCommentLength: number | null;
  /** Comments with body > 50 chars from non-bot users */
  substantiveComments: number;
  /** Comments with body <= 50 chars or from bots */
  trivialComments: number;
  topCommenters: Array<{ login: string; commentCount: number; avgLength: number }>;
  highDiscussionPRs: Array<{ prNumber: number; commentCount: number }>;
}

function isBot(login: string): boolean {
  return login.includes("[bot]") || login.endsWith("-bot");
}

export function calcCommentAnalysis(
  comments: GhPRComment[],
  prs: GhPullRequest[],
): CommentAnalysisStats {
  const prAuthors = new Map(prs.map((pr) => [pr.number, pr.user_login]));

  const issueComments = comments.filter((c) => c.comment_type === "issue_comment").length;
  const reviewComments = comments.filter((c) => c.comment_type === "review_comment").length;

  // External commenters (not the PR author, not bots)
  const externalLogins = new Set<string>();
  for (const c of comments) {
    const prAuthor = prAuthors.get(c.pr_number);
    if (c.user_login !== prAuthor && !isBot(c.user_login)) {
      externalLogins.add(c.user_login);
    }
  }

  // Comments per PR
  const commentsByPR = new Map<number, number>();
  for (const c of comments) {
    commentsByPR.set(c.pr_number, (commentsByPR.get(c.pr_number) ?? 0) + 1);
  }
  const prsWithComments = commentsByPR.size;

  // Substantive vs trivial
  let substantive = 0;
  let trivial = 0;
  for (const c of comments) {
    if (!isBot(c.user_login) && c.body.length > 50) {
      substantive++;
    } else {
      trivial++;
    }
  }

  // Average comment length
  const totalLength = comments.reduce((sum, c) => sum + c.body.length, 0);

  // Top commenters
  const commenterMap = new Map<string, { count: number; totalLen: number }>();
  for (const c of comments) {
    if (isBot(c.user_login)) continue;
    const entry = commenterMap.get(c.user_login) ?? { count: 0, totalLen: 0 };
    entry.count++;
    entry.totalLen += c.body.length;
    commenterMap.set(c.user_login, entry);
  }
  const topCommenters = [...commenterMap.entries()]
    .map(([login, { count, totalLen }]) => ({
      login,
      commentCount: count,
      avgLength: Math.round(totalLen / count),
    }))
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 10);

  // High-discussion PRs
  const highDiscussionPRs = [...commentsByPR.entries()]
    .map(([prNumber, commentCount]) => ({ prNumber, commentCount }))
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 10);

  return {
    totalComments: comments.length,
    issueComments,
    reviewComments,
    uniqueExternalCommenters: externalLogins.size,
    avgCommentsPerPR: prsWithComments > 0 ? comments.length / prsWithComments : null,
    avgCommentLength: comments.length > 0 ? Math.round(totalLength / comments.length) : null,
    substantiveComments: substantive,
    trivialComments: trivial,
    topCommenters,
    highDiscussionPRs,
  };
}
