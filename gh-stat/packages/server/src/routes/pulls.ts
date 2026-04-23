import type { StorageProvider } from "@kfang/ghstat-persistence";

export async function handlePulls(
  req: Request,
  storage: StorageProvider,
): Promise<Response | null> {
  const url = new URL(req.url);

  // GET /api/repos/:owner/:repo/pulls
  const match = url.pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/pulls$/);
  if (!match) return null;

  const [, owner, repo] = match;
  const fullName = `${owner}/${repo}`;
  const prs = await storage.getPullRequests(fullName);

  // Optional filters
  const state = url.searchParams.get("state");
  const filtered = state ? prs.filter((p) => p.state === state) : prs;

  return new Response(JSON.stringify(filtered), {
    headers: { "Content-Type": "application/json" },
  });
}
