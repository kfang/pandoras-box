import { join, dirname } from "path";
import { readFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import Fastify from "fastify";
import { createGitHubClient } from "@kfang/ghstat-github-data";
import { createSqliteProvider, syncAll } from "@kfang/ghstat-persistence";
import { loadConfig } from "./config.js";
import { registerRepoRoutes } from "./routes/repos.js";
import { registerPullRoutes } from "./routes/pulls.js";
import { registerStatRoutes } from "./routes/stats.js";

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

const dataDir = dirname(dbPath);
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

function serveView(name: string, title: string): string {
  const content = readFileSync(join(__dirname, `views/${name}.html`), "utf8");
  return renderLayout(title, content);
}

// ---- Server ----------------------------------------------------------------
const app = Fastify();

registerRepoRoutes(app, storage);
registerPullRoutes(app, storage);
registerStatRoutes(app, storage);

app.post("/api/sync", async (_req, reply) => {
  syncAll(client, storage, config).catch((err) =>
    console.error("Manual sync error:", err),
  );
  return reply.send({ ok: true, message: "Sync started" });
});

app.get("/", async (_req, reply) => {
  return reply.type("text/html").send(serveView("index", "Dashboard"));
});

app.get("/repo/*", async (req, reply) => {
  const repoName = (req.params as Record<string, string>)["*"] ?? "";
  return reply.type("text/html").send(serveView("repo", repoName));
});

app.listen({ port: config.server.port, host: config.server.host }, (err, address) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`gh-stat running at ${address}`);
});
