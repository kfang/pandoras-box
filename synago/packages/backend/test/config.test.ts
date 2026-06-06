import { describe, it, expect, beforeEach } from "vitest"
import { loadConfig } from "../src/config.ts"

describe("config", () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...origEnv }
    delete process.env.PORT
    delete process.env.DB_PROVIDER
    delete process.env.AUTH_SECRET
  })

  it("loads defaults when no config file exists", () => {
    const config = loadConfig("/nonexistent/config.yaml")
    expect(config.server.port).toBe(3000)
    expect(config.db.provider).toBe("sqlite")
    expect(config.auth.url).toBe("http://localhost:3000")
  })

  it("env vars override defaults", () => {
    process.env.PORT = "4000"
    process.env.DB_PROVIDER = "postgres"
    process.env.DATABASE_URL = "postgres://localhost:5432/test"
    process.env.AUTH_SECRET = "a".repeat(32)

    const config = loadConfig("/nonexistent/config.yaml")
    expect(config.server.port).toBe(4000)
    expect(config.db.provider).toBe("postgres")
    expect(config.db.postgres.url).toBe("postgres://localhost:5432/test")
  })

  it("validates auth secret minimum length", () => {
    process.env.AUTH_SECRET = "short"
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow()
  })
})
