import { readFileSync } from "node:fs"
import { z } from "zod"
import { load } from "js-yaml"

const configSchema = z.object({
  server: z.object({
    port: z.coerce.number().default(3000),
    host: z.string().default("0.0.0.0"),
  }).default({}),
  db: z.object({
    provider: z.enum(["sqlite", "postgres"]).default("sqlite"),
    sqlite: z.object({
      path: z.string().default("/data/synago.db"),
    }).default({}),
    postgres: z.object({
      url: z.string().optional(),
    }).default({}),
  }).default({}),
  auth: z.object({
    secret: z.string().min(32).optional(),
    url: z.string().default("http://localhost:3000"),
  }).default({}),
  log: z.object({
    level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  }).default({}),
  data_dir: z.string().default("/data"),
})

export type Config = z.infer<typeof configSchema>

const envOverrides: Record<string, string> = {
  PORT: "server.port",
  HOST: "server.host",
  DB_PROVIDER: "db.provider",
  DB_SQLITE_PATH: "db.sqlite.path",
  DATABASE_URL: "db.postgres.url",
  AUTH_SECRET: "auth.secret",
  AUTH_URL: "auth.url",
  LOG_LEVEL: "log.level",
  DATA_DIR: "data_dir",
}

function applyEnvOverrides(raw: Record<string, unknown>): Record<string, unknown> {
  for (const [envVar, configPath] of Object.entries(envOverrides)) {
    const val = process.env[envVar]
    if (val === undefined) continue
    const parts = configPath.split(".")
    if (parts.length === 0) continue
    let target = raw
    const lastIdx = parts.length - 1
    for (let i = 0; i < lastIdx; i++) {
      const part = parts[i]
      if (part === undefined) continue
      if (!(part in target) || typeof target[part] !== "object") target[part] = {}
      target = target[part] as Record<string, unknown>
    }
    const key = parts[lastIdx]
    if (key === undefined) continue
    target[key] = val
  }
  return raw
}

export function loadConfig(configPath?: string): Config {
  const filePath = configPath ?? process.env.CONFIG_PATH ?? "config.yaml"
  let raw: Record<string, unknown> = {}

  try {
    const content = readFileSync(filePath, "utf-8")
    raw = load(content) as Record<string, unknown>
  } catch {
    // file not found, use defaults
  }

  applyEnvOverrides(raw)

  return configSchema.parse(raw)
}
