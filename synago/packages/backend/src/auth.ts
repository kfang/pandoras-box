import { betterAuth } from "better-auth"
import type { Config } from "./config.ts"
import type { Database } from "./db.ts"

export function createAuth(config: Config, db: Database) {
  const database = db

  return betterAuth({
    database,
    secret: config.auth.secret,
    baseURL: config.auth.url,
    emailAndPassword: {
      enabled: true,
    },
  })
}
