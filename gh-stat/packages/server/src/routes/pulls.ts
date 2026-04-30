import type { FastifyInstance } from "fastify";
import type { StorageProvider } from "@kfang/ghstat-persistence";

export function registerPullRoutes(app: FastifyInstance, storage: StorageProvider): void {
  // GET /api/repos/:owner/:repo/pulls
  app.get<{ Params: { owner: string; repo: string } }>(
    "/api/repos/:owner/:repo/pulls",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const fullName = `${owner}/${repo}`;
      const prs = await storage.getPullRequests(fullName);

      const state = (req.query as Record<string, string>)["state"];
      const filtered = state ? prs.filter((p) => p.state === state) : prs;

      return reply.send(filtered);
    },
  );
}
