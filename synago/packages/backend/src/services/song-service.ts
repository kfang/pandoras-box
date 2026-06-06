import type { SongRepository } from "../repositories/song-repository.ts"
import type { Song, SongCreate, SongUpdate } from "@synago/common/src/types.ts"

export class SongService {
  constructor(private repo: SongRepository) {}

  async list(): Promise<Song[]> {
    return this.repo.findAll()
  }

  async get(id: string): Promise<Song | null> {
    return this.repo.findById(id)
  }

  async create(data: SongCreate): Promise<Song> {
    if (!data.title.trim()) {
      throw new Error("Title is required")
    }
    if (!data.content.trim()) {
      throw new Error("Content is required")
    }
    return this.repo.create(data)
  }

  async update(id: string, data: SongUpdate): Promise<Song | null> {
    return this.repo.update(id, data)
  }

  async delete(id: string): Promise<boolean> {
    return this.repo.delete(id)
  }
}
