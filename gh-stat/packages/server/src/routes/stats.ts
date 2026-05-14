import type { FastifyInstance } from "fastify";
import type { StorageProvider } from "@kfang/ghstat-persistence";
import {
  calcPRVelocity,
  calcContributorStats,
  calcRepoHealth,
  calcOrgRollups,
  calcReviewCycle,
  calcCommentAnalysis,
  calcRepoDemand,
  calcEngineerReviewPct,
  calcCodeOwnerDemand,
  calcReviewerFamiliarity,
} from "@kfang/ghstat-stats";
import type { ResolvedCodeOwnerGroup } from "@kfang/ghstat-stats";
import type { GhPullRequest, GhPRReview } from "@kfang/ghstat-github-data";

function parseTimeWindow(query: Record<string, unknown>): { since: Date; until: Date } {
  const now = new Date();
  const since = query["since"]
    ? new Date(query["since"] as string)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const until = query["until"]
    ? new Date(query["until"] as string)
    : now;
  return { since, until };
}

async function resolveCodeOwnerGroups(storage: StorageProvider): Promise<ResolvedCodeOwnerGroup[]> {
  const allEntries = await storage.getCodeOwnerEntries();
  const allMembers = await storage.getAllTeamMembers();

  // Build team -> members map
  const membersByTeam = new Map<string, string[]>();
  for (const m of allMembers) {
    const key = `${m.org}/${m.team_slug}`;
    let list = membersByTeam.get(key);
    if (!list) {
      list = [];
      membersByTeam.set(key, list);
    }
    list.push(m.user_login);
  }

  // Build team -> repos map from CODEOWNERS entries
  const teamRepos = new Map<string, Set<string>>();
  for (const entry of allEntries) {
    for (const owner of entry.owners) {
      const match = owner.match(/^@([^/]+)\/(.+)$/);
      if (match) {
        const key = `${match[1]}/${match[2]}`;
        let repos = teamRepos.get(key);
        if (!repos) {
          repos = new Set();
          teamRepos.set(key, repos);
        }
        repos.add(entry.repo_full_name);
      }
    }
  }

  const groups: ResolvedCodeOwnerGroup[] = [];
  const allTeamKeys = new Set([...membersByTeam.keys(), ...teamRepos.keys()]);
  for (const key of allTeamKeys) {
    const [org, ...slugParts] = key.split("/");
    const teamSlug = slugParts.join("/");
    if (!org || !teamSlug) continue;

    const members = membersByTeam.get(key) ?? [];
    const repos = [...(teamRepos.get(key) ?? [])];
    if (members.length === 0 || repos.length === 0) continue;

    groups.push({ org, teamSlug, members, repos });
  }

  return groups;
}

export function registerStatRoutes(app: FastifyInstance, storage: StorageProvider): void {
  // GET /api/stats/org/:org
  app.get<{ Params: { org: string }; Querystring: Record<string, unknown> }>("/api/stats/org/:org", async (req, reply) => {
    const { org } = req.params;
    const window = parseTimeWindow(req.query);
    const repos = await storage.getRepos({ org });
    const prsByRepo = new Map<string, GhPullRequest[]>();
    const allReviews: GhPRReview[] = [];
    for (const repo of repos) {
      prsByRepo.set(repo.full_name, await storage.getPullRequests(repo.full_name));
      allReviews.push(...(await storage.getReviews(repo.full_name)));
    }
    const allPRs = [...prsByRepo.values()].flat();
    const allComments = (
      await Promise.all(repos.map((r) => storage.getComments(r.full_name)))
    ).flat();
    const reviewsByPR = groupReviewsByPR(allReviews);
    const groups = await resolveCodeOwnerGroups(storage);

    // Per-repo summaries for dashboard sorting
    const repoSummaries = repos.map((repo) => {
      const prs = prsByRepo.get(repo.full_name) ?? [];
      const demand = calcRepoDemand(prs, repo.full_name, window);
      const familiarity = calcReviewerFamiliarity(prs, repo.full_name, groups, 30);
      const maxFamiliarityPct = familiarity.groupFamiliarity.length > 0
        ? Math.max(...familiarity.groupFamiliarity.map((g) => g.familiarityPct))
        : null;
      return {
        repoFullName: repo.full_name,
        avgPRsPerDay: demand.avgPRsPerDay,
        avgPRsPerWeek: demand.avgPRsPerWeek,
        maxFamiliarityPct,
      };
    });

    return reply.send({
      ...calcOrgRollups(repos, prsByRepo, org),
      reviewCycle: calcReviewCycle(allPRs, reviewsByPR),
      commentAnalysis: calcCommentAnalysis(allComments, allPRs),
      codeOwnerDemand: calcCodeOwnerDemand(groups, prsByRepo, window),
      repoSummaries,
    });
  });

  // GET /api/stats/org/:org/code-owner-demand
  app.get<{ Params: { org: string }; Querystring: Record<string, unknown> }>("/api/stats/org/:org/code-owner-demand", async (req, reply) => {
    const { org } = req.params;
    const window = parseTimeWindow(req.query);
    const repos = await storage.getRepos({ org });
    const prsByRepo = new Map<string, GhPullRequest[]>();
    for (const repo of repos) {
      prsByRepo.set(repo.full_name, await storage.getPullRequests(repo.full_name));
    }
    const groups = await resolveCodeOwnerGroups(storage);
    return reply.send(calcCodeOwnerDemand(groups, prsByRepo, window));
  });

  // GET /api/stats/:owner/:repo
  app.get<{ Params: { owner: string; repo: string }; Querystring: Record<string, unknown> }>(
    "/api/stats/:owner/:repo",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const window = parseTimeWindow(req.query);
      const repos = await storage.getRepos({ org: owner });
      const repoData = repos.find((r) => r.full_name === fullName);
      if (!repoData) return reply.status(404).send("Not found");
      const prs = await storage.getPullRequests(fullName);
      const reviews = await storage.getReviews(fullName);
      const comments = await storage.getComments(fullName);
      const reviewsByPR = groupReviewsByPR(reviews);
      const groups = await resolveCodeOwnerGroups(storage);
      const lookbackDays = req.query["lookback_days"]
        ? Number(req.query["lookback_days"])
        : 30;

      return reply.send({
        repo: fullName,
        velocity: calcPRVelocity(prs),
        contributors: calcContributorStats(prs),
        health: calcRepoHealth(repoData, prs),
        reviewCycle: calcReviewCycle(prs, reviewsByPR),
        commentAnalysis: calcCommentAnalysis(comments, prs),
        repoDemand: calcRepoDemand(prs, fullName, window),
        engineerReviewPct: calcEngineerReviewPct(reviews, prs, window),
        reviewerFamiliarity: calcReviewerFamiliarity(prs, fullName, groups, lookbackDays),
      });
    },
  );

  // GET /api/stats/:owner/:repo/demand
  app.get<{ Params: { owner: string; repo: string }; Querystring: Record<string, unknown> }>(
    "/api/stats/:owner/:repo/demand",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const window = parseTimeWindow(req.query);
      const prs = await storage.getPullRequests(fullName);
      return reply.send(calcRepoDemand(prs, fullName, window));
    },
  );

  // GET /api/stats/:owner/:repo/engineer-review-pct
  app.get<{ Params: { owner: string; repo: string }; Querystring: Record<string, unknown> }>(
    "/api/stats/:owner/:repo/engineer-review-pct",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const window = parseTimeWindow(req.query);
      const prs = await storage.getPullRequests(fullName);
      const reviews = await storage.getReviews(fullName);
      return reply.send(calcEngineerReviewPct(reviews, prs, window));
    },
  );

  // GET /api/stats/:owner/:repo/reviewer-familiarity
  app.get<{ Params: { owner: string; repo: string }; Querystring: Record<string, unknown> }>(
    "/api/stats/:owner/:repo/reviewer-familiarity",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const lookbackDays = req.query["lookback_days"]
        ? Number(req.query["lookback_days"])
        : 30;
      const prs = await storage.getPullRequests(fullName);
      const groups = await resolveCodeOwnerGroups(storage);
      return reply.send(calcReviewerFamiliarity(prs, fullName, groups, lookbackDays));
    },
  );
}

function groupReviewsByPR(reviews: GhPRReview[]): Map<number, GhPRReview[]> {
  const map = new Map<number, GhPRReview[]>();
  for (const r of reviews) {
    let arr = map.get(r.pr_number);
    if (!arr) {
      arr = [];
      map.set(r.pr_number, arr);
    }
    arr.push(r);
  }
  return map;
}
