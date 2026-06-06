export interface Song {
  id: string
  title: string
  artist: string
  content: string
  format: "chordpro" | "opensong"
  createdAt: Date
  updatedAt: Date
}

export interface SongCreate {
  title: string
  artist: string
  content: string
  format: "chordpro" | "opensong"
}

export interface SongUpdate {
  title?: string
  artist?: string
  content?: string
  format?: "chordpro" | "opensong"
}
