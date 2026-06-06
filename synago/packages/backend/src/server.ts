import "./tracing.ts"

import Fastify from "fastify"
import fastifyStatic from "@fastify/static"
import { join } from "node:path"

import { loadConfig } from "./config.ts"
import { createDb } from "./db.ts"
import { migrate } from "./migrate.ts"
import { createAuth } from "./auth.ts"
import { SongRepository } from "./repositories/song-repository.ts"
import { SongService } from "./services/song-service.ts"
import { SongController } from "./controllers/song-controller.ts"

async function main() {
  const config = loadConfig()

  const db = createDb(config)
  await migrate(db, config.data_dir)

  const auth = createAuth(config, db)

  const songRepo = new SongRepository(db)
  const songSvc = new SongService(songRepo)
  const songCtrl = new SongController(songSvc)

  const app = Fastify({
    logger: {
      level: config.log.level,
    },
  })

  await app.register(fastifyStatic, {
    root: join(import.meta.dirname, "../public"),
    prefix: "/",
  })

  app.all("/api/auth/*", async (req) => {
    return auth.handler(req.raw as unknown as Request)
  })

  songCtrl.register(app)

  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile("index.html")
  })

  try {
    await app.listen({ port: config.server.port, host: config.server.host })
    app.log.info(`synago listening on ${config.server.host}:${String(config.server.port)}`)
  } catch (err) {
    app.log.fatal(err)
    process.exit(1)
  }
}

void main()
