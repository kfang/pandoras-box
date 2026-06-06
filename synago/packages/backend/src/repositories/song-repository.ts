import { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"
import type { Database } from "../db.ts"
import type { Song, SongCreate, SongUpdate } from "@synago/common/src/types.ts"

interface DbSong {
  id: string
  title: string
  artist: string
  content: string
  format: string
  created_at: string
  updated_at: string
}

export class SongRepository {
  constructor(private db: Database) {}

  private readonly toSong = (row: DbSong): Song => ({
    id: row.id,
    title: row.title,
    artist: row.artist,
    content: row.content,
    format: row.format as "chordpro" | "opensong",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  })

  async findAll(): Promise<Song[]> {
    if (this.db instanceof DatabaseSync) {
      const rows = this.db.prepare("SELECT * FROM songs ORDER BY title").all() as Record<string, unknown>[]
      return rows.map((r) => this.toSong(r as unknown as DbSong))
    }
    const result = await this.db.query("SELECT * FROM songs ORDER BY title")
    return result.rows.map(this.toSong)
  }

  async findById(id: string): Promise<Song | null> {
    if (this.db instanceof DatabaseSync) {
      const row = this.db.prepare("SELECT * FROM songs WHERE id = ?").get(id) as DbSong | undefined
      return row ? this.toSong(row) : null
    }
    const result = await this.db.query("SELECT * FROM songs WHERE id = $1", [id])
    return result.rows[0] ? this.toSong(result.rows[0] as DbSong) : null
  }

  async create(data: SongCreate): Promise<Song> {
    const id = randomUUID()
    if (this.db instanceof DatabaseSync) {
      this.db.prepare(
        "INSERT INTO songs (id, title, artist, content, format) VALUES (?, ?, ?, ?, ?)",
      ).run(id, data.title, data.artist, data.content, data.format)
      const song = await this.findById(id)
      if (!song) throw new Error("Failed to create song")
      return song
    }
    await this.db.query(
      "INSERT INTO songs (id, title, artist, content, format) VALUES ($1, $2, $3, $4, $5)",
      [id, data.title, data.artist, data.content, data.format],
    )
    const song = await this.findById(id)
    if (!song) throw new Error("Failed to create song")
    return song
  }

  async update(id: string, data: SongUpdate): Promise<Song | null> {
    const existing = await this.findById(id)
    if (!existing) return null

    const title = data.title ?? existing.title
    const artist = data.artist ?? existing.artist
    const content = data.content ?? existing.content
    const format = data.format ?? existing.format

    if (this.db instanceof DatabaseSync) {
      this.db.prepare(
        "UPDATE songs SET title = ?, artist = ?, content = ?, format = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(title, artist, content, format, id)
    } else {
      await this.db.query(
        "UPDATE songs SET title = $1, artist = $2, content = $3, format = $4, updated_at = now() WHERE id = $5",
        [title, artist, content, format, id],
      )
    }

    return this.findById(id)
  }

  async delete(id: string): Promise<boolean> {
    if (this.db instanceof DatabaseSync) {
      const result = this.db.prepare("DELETE FROM songs WHERE id = ?").run(id)
      return result.changes > 0
    }
    const result = await this.db.query("DELETE FROM songs WHERE id = $1", [id])
    return (result.rowCount ?? 0) > 0
  }
}
