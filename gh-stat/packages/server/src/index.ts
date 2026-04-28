import { join, dirname } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createGitHubClient } from "@kfang/ghstat-github-data";
import { createSqliteProvider, syncAll } from "@kfang/ghstat-persistence";
import { loadConfig } from "./config.js";
import { handleRepos } from "./routes/repos.js";
import { handlePulls } from "./routes/pulls.js";
import { handleStats } from "./routes/stats.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Config ----------------------------------------------------------------
const configPath = process.env["CONFIG_PATH"] ?? join(process.cwd(), "config.yaml");
const config = loadConfig(configPath);

// ---- Storage ---------------------------------------------------------------
if (config.persistence.type !== "sqlite") {
  console.error("Only sqlite persistence is supported in standalone mode.");
  process.exit(1);
}
const dbPath = config.persistence.sqlite?.path ?? "./data/gh-stat.db";

// Ensure data directory exists
const dataDir = dirname(dbPath);
import { mkdirSync } from "fs";
mkdirSync(dataDir, { recursive: true });

const storage = createSqliteProvider(dbPath);

// ---- GitHub client ---------------------------------------------------------
const client = createGitHubClient(config.github.token);

// ---- Initial sync ----------------------------------------------------------
if (config.refresh.on_start) {
  console.log("Starting initial sync…");
  syncAll(client, storage, config).catch((err) =>
    console.error("Sync error:", err),
  );
}

// ---- Scheduled sync --------------------------------------------------------
const intervalMs = config.refresh.interval * 1000;
setInterval(() => {
  console.log("Running scheduled sync…");
  syncAll(client, storage, config).catch((err) =>
    console.error("Sync error:", err),
  );
}, intervalMs);

// ---- HTML helpers ----------------------------------------------------------
function renderLayout(title: string, content: string): string {
  const layout = readFileSync(join(__dirname, "views/layout.html"), "utf8");
  return layout.replace("{{title}}", title).replace("{{content}}", content);
}

function serveView(name: string, title: string): Response {
  const content = readFileSync(join(__dirname, `views/${name}.html`), "utf8");
  return new Response(renderLayout(title, content), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---- Server ----------------------------------------------------------------
const server = Bun.serve({
  port: config.server.port,
  hostname: config.server.host,

  async fetch(req) {
    const url = new URL(req.url);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      const reposRes = await handleRepos(req, storage);
      if (reposRes) return reposRes;

      const pullsRes = await handlePulls(req, storage);
      if (pullsRes) return pullsRes;

      const statsRes = await handleStats(req, storage);
      if (statsRes) return statsRes;

      return new Response("Not found", { status: 404 });
    }

    // POST /api/sync — trigger a manual sync
    if (url.pathname === "/api/sync" && req.method === "POST") {
      syncAll(client, storage, config).catch((err) =>
        console.error("Manual sync error:", err),
      );
      return new Response(JSON.stringify({ ok: true, message: "Sync started" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Frontend views
    if (url.pathname === "/") {
      return serveView("index", "Dashboard");
    }

    if (url.pathname.startsWith("/repo/")) {
      const repoName = url.pathname.slice("/repo/".length);
      return serveView("repo", repoName);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`gh-stat running at http://${config.server.host}:${server.port}`);
