import { describe, it, expect, beforeEach } from "vitest"
import Fastify from "fastify"
import { DatabaseSync } from "node:sqlite"
import { SongRepository } from "../../src/repositories/song-repository.ts"
import { SongService } from "../../src/services/song-service.ts"
import { SongController } from "../../src/controllers/song-controller.ts"

function createApp() {
  const app = Fastify()
  const db = new DatabaseSync(":memory:")
  db.exec(`
    CREATE TABLE songs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'chordpro',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  const repo = new SongRepository(db)
  const svc = new SongService(repo)
  const ctrl = new SongController(svc)
  ctrl.register(app)
  return app
}

describe("SongController", () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    app = createApp()
  })

  it("GET /api/songs returns empty list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/songs" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it("POST /api/songs creates a song", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/songs",
      body: { title: "Test", artist: "Me", content: "[C]test", format: "chordpro" },
    })
    expect(res.statusCode).toBe(201)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(res.json().title).toBe("Test")
  })

  it("POST /api/songs rejects empty title", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/songs",
      body: { title: "", artist: "", content: "x", format: "chordpro" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("GET /api/songs/:id returns 404 for missing", async () => {
    const res = await app.inject({ method: "GET", url: "/api/songs/nonexistent" })
    expect(res.statusCode).toBe(404)
  })

  it("DELETE /api/songs/:id deletes a song", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/songs",
      body: { title: "Test", artist: "", content: "x", format: "chordpro" },
    })
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const id = created.json().id
    const res = await app.inject({ method: "DELETE", url: `/api/songs/${String(id)}` })
    expect(res.statusCode).toBe(204)
  })
})
