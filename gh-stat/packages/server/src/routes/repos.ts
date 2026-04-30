import type { FastifyInstance } from "fastify";
import type { StorageProvider } from "@kfang/ghstat-persistence";

export function registerRepoRoutes(app: FastifyInstance, storage: StorageProvider): void {
  // GET /api/repos?org=xxx
  app.get("/api/repos", async (req, reply) => {
    const org = (req.query as Record<string, string>)["org"] ?? undefined;
    const repos = await storage.getRepos(org ? { org } : undefined);
    return reply.send(repos);
  });

  // GET /api/repos/:owner/:repo
  app.get<{ Params: { owner: string; repo: string } }>(
    "/api/repos/:owner/:repo",
    async (req, reply) => {
      const { owner, repo } = req.params;
      const repos = await storage.getRepos({ org: owner });
      const found = repos.find((r) => r.full_name === `${owner}/${repo}`);
      if (!found) return reply.status(404).send("Not found");
      return reply.send(found);
    },
  );
}
