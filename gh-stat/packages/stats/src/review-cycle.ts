import type { GhPullRequest, GhPRReview } from "@kfang/ghstat-github-data";
import { percentile, formatDuration } from "./util.js";

export interface ReviewCycleStats {
  /** Non-draft PRs with at least one external review */
  analyzedPRs: number;
  avgTimeToFirstReviewMs: number | null;
  avgTimeToFirstReviewLabel: string | null;
  p50TimeToFirstReviewMs: number | null;
  p90TimeToFirstReviewMs: number | null;
  avgFeedbackLoops: number | null;
  p50FeedbackLoops: number | null;
  p90FeedbackLoops: number | null;
  perPR: PRReviewCycleDetail[];
}

export interface PRReviewCycleDetail {
  prNumber: number;
  prAuthor: string;
  timeToFirstReviewMs: number | null;
  feedbackLoops: number;
  reviewerCount: number;
}

export function calcReviewCycle(
  prs: GhPullRequest[],
  reviewsByPR: Map<number, GhPRReview[]>,
): ReviewCycleStats {
  const perPR: PRReviewCycleDetail[] = [];

  for (const pr of prs) {
    if (pr.draft) continue;

    const reviews = reviewsByPR.get(pr.number);
    if (!reviews || reviews.length === 0) continue;

    // External reviews only (exclude self-reviews)
    const external = reviews
      .filter((r) => r.user_login !== pr.user_login)
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());

    if (external.length === 0) continue;

    const firstReviewTime = new Date(external[0]!.submitted_at).getTime();
    const createdTime = new Date(pr.ready_for_review_at ?? pr.created_at).getTime();
    const timeToFirstReview = firstReviewTime - createdTime;

    const feedbackLoops = external.filter((r) => r.state === "CHANGES_REQUESTED").length;

    const reviewerCount = new Set(external.map((r) => r.user_login)).size;

    perPR.push({
      prNumber: pr.number,
      prAuthor: pr.user_login,
      timeToFirstReviewMs: timeToFirstReview >= 0 ? timeToFirstReview : null,
      feedbackLoops,
      reviewerCount,
    });
  }

  const ttfrValues = perPR
    .map((d) => d.timeToFirstReviewMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const loopValues = perPR
    .map((d) => d.feedbackLoops)
    .sort((a, b) => a - b);

  const avgTtfr = ttfrValues.length > 0
    ? ttfrValues.reduce((s, v) => s + v, 0) / ttfrValues.length
    : null;

  const avgLoops = loopValues.length > 0
    ? loopValues.reduce((s, v) => s + v, 0) / loopValues.length
    : null;

  return {
    analyzedPRs: perPR.length,
    avgTimeToFirstReviewMs: avgTtfr,
    avgTimeToFirstReviewLabel: avgTtfr !== null ? formatDuration(avgTtfr) : null,
    p50TimeToFirstReviewMs: percentile(ttfrValues, 50),
    p90TimeToFirstReviewMs: percentile(ttfrValues, 90),
    avgFeedbackLoops: avgLoops,
    p50FeedbackLoops: percentile(loopValues, 50),
    p90FeedbackLoops: percentile(loopValues, 90),
    perPR,
  };
}
