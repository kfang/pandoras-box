import "./components/song-list.ts"

declare const Alpine: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: (name: string, fn: (...args: any[]) => Record<string, unknown>) => void
  start: () => void
  store: (name: string, data: Record<string, unknown>) => void
}

interface Song {
  id: string
  title: string
  artist: string
  content: string
  format: string
}

async function fetchSongs(): Promise<Song[]> {
  const res = await fetch("/api/songs")
  if (!res.ok) return []
  return res.json() as Promise<Song[]>
}

async function createSong(data: {
  title: string
  artist: string
  content: string
  format: string
}): Promise<Song | null> {
  const res = await fetch("/api/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) return null
  return res.json() as Promise<Song>
}

document.addEventListener("alpine:init", () => {
  Alpine.data("app", () => ({
    view: "songs",
    songs: [] as Song[],
    showAddForm: false,
    selectedSong: null as Song | null,
    form: { title: "", artist: "", content: "", format: "chordpro" },

    async addSong() {
      const form = this.form as { title: string; artist: string; content: string; format: string }
      const song = await createSong(form)
      if (song) {
        ;(this.songs as Song[]).push(song)
        this.showAddForm = false
        this.form = { title: "", artist: "", content: "", format: "chordpro" }
      }
    },

    selectSong(song: Song) {
      this.selectedSong = song
    },
  }))

  Alpine.data("songList", () => ({
    songs: [] as Song[],
    async init(this: Record<string, unknown>) {
      this.songs = await fetchSongs()
    },
  }))

  Alpine.start()
})
