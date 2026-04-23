import type { StorageProvider } from "@kfang/ghstat-persistence";

export async function handleRepos(
  req: Request,
  storage: StorageProvider,
): Promise<Response | null> {
  const url = new URL(req.url);

  // GET /api/repos?org=xxx
  if (url.pathname === "/api/repos") {
    const org = url.searchParams.get("org") ?? undefined;
    const repos = await storage.getRepos(org ? { org } : undefined);
    return json(repos);
  }

  // GET /api/repos/:owner/:repo
  const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)$/);
  if (match) {
    const [, owner, repo] = match;
    const repos = await storage.getRepos({ org: owner! });
    const found = repos.find((r) => r.full_name === `${owner}/${repo}`);
    if (!found) return new Response("Not found", { status: 404 });
    return json(found);
  }

  return null;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
