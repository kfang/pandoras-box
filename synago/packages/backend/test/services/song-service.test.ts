import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { SongRepository } from "../../src/repositories/song-repository.ts"
import { SongService } from "../../src/services/song-service.ts"

function createTestRepo(): SongRepository {
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
  return new SongRepository(db)
}

describe("SongService", () => {
  let svc: SongService

  beforeEach(() => {
    svc = new SongService(createTestRepo())
  })

  it("creates a song", async () => {
    const song = await svc.create({ title: "Test", artist: "Me", content: "[C]test", format: "chordpro" })
    expect(song.title).toBe("Test")
  })

  it("rejects empty title", async () => {
    await expect(svc.create({ title: "", artist: "", content: "x", format: "chordpro" })).rejects.toThrow(
      "Title is required",
    )
  })

  it("rejects empty content", async () => {
    await expect(svc.create({ title: "Test", artist: "", content: "", format: "chordpro" })).rejects.toThrow(
      "Content is required",
    )
  })

  it("lists songs", async () => {
    await svc.create({ title: "A", artist: "", content: "x", format: "chordpro" })
    await svc.create({ title: "B", artist: "", content: "y", format: "chordpro" })
    const songs = await svc.list()
    expect(songs).toHaveLength(2)
  })

  it("deletes a song", async () => {
    const song = await svc.create({ title: "Test", artist: "", content: "x", format: "chordpro" })
    const deleted = await svc.delete(song.id)
    expect(deleted).toBe(true)
    expect(await svc.get(song.id)).toBeNull()
  })
})
