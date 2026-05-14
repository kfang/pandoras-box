import type { GhPullRequest, GhPRReview } from "@kfang/ghstat-github-data";

export interface EngineerReviewStat {
  login: string;
  uniquePRsReviewed: number;
  reviewPctOfAllPRs: number;
}

export interface EngineerReviewPctStats {
  engineers: EngineerReviewStat[];
  totalPRsInWindow: number;
}

export function calcEngineerReviewPct(
  reviews: GhPRReview[],
  prs: GhPullRequest[],
  window: { since: Date; until: Date },
): EngineerReviewPctStats {
  const sinceMs = window.since.getTime();
  const untilMs = window.until.getTime();

  // PRs created in the window
  const windowPRs = prs.filter((pr) => {
    const t = new Date(pr.created_at).getTime();
    return t >= sinceMs && t < untilMs;
  });

  const windowPRNumbers = new Set(windowPRs.map((pr) => pr.number));
  const totalPRs = windowPRNumbers.size;

  // Group reviews by reviewer, counting unique PRs reviewed
  const reviewerPRs = new Map<string, Set<number>>();
  for (const review of reviews) {
    if (!windowPRNumbers.has(review.pr_number)) continue;
    let prSet = reviewerPRs.get(review.user_login);
    if (!prSet) {
      prSet = new Set();
      reviewerPRs.set(review.user_login, prSet);
    }
    prSet.add(review.pr_number);
  }

  const engineers: EngineerReviewStat[] = [];
  for (const [login, prSet] of reviewerPRs) {
    engineers.push({
      login,
      uniquePRsReviewed: prSet.size,
      reviewPctOfAllPRs: totalPRs > 0 ? Math.round((prSet.size / totalPRs) * 10000) / 100 : 0,
    });
  }

  engineers.sort((a, b) => b.uniquePRsReviewed - a.uniquePRsReviewed);

  return { engineers, totalPRsInWindow: totalPRs };
}
