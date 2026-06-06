import { describe, it, expect, beforeEach } from "vitest"
import { DatabaseSync } from "node:sqlite"
import { SongRepository } from "../../src/repositories/song-repository.ts"
import type { SongCreate } from "@synago/common/src/types.ts"

function createTestDb(): DatabaseSync {
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
  return db
}

describe("SongRepository", () => {
  let repo: SongRepository

  beforeEach(() => {
    repo = new SongRepository(createTestDb())
  })

  it("creates a song", async () => {
    const input: SongCreate = { title: "Test", artist: "Me", content: "[C]test", format: "chordpro" }
    const song = await repo.create(input)
    expect(song.id).toBeTruthy()
    expect(song.title).toBe("Test")
  })

  it("finds all songs", async () => {
    await repo.create({ title: "A", artist: "", content: "x", format: "chordpro" })
    await repo.create({ title: "B", artist: "", content: "y", format: "chordpro" })
    const songs = await repo.findAll()
    expect(songs).toHaveLength(2)
  })

  it("finds by id", async () => {
    const created = await repo.create({ title: "Test", artist: "", content: "x", format: "chordpro" })
    const found = await repo.findById(created.id)
    expect(found?.title).toBe("Test")
  })

  it("returns null for missing id", async () => {
    const found = await repo.findById("nonexistent")
    expect(found).toBeNull()
  })

  it("deletes a song", async () => {
    const created = await repo.create({ title: "Test", artist: "", content: "x", format: "chordpro" })
    const deleted = await repo.delete(created.id)
    expect(deleted).toBe(true)
    expect(await repo.findById(created.id)).toBeNull()
  })
})
