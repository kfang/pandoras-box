export interface HeaderEntry {
  key: string
  value: string
}

export interface InlineChord {
  chord: string
  text: string
}

export interface ContentLine {
  parts: InlineChord[]
}

export interface SongSection {
  type: string
  lines: ContentLine[]
}

export interface Song {
  type: "song"
  header: HeaderEntry[]
  body: SongSection[]
}
