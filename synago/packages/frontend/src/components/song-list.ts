interface Song {
  id: string
  title: string
  artist: string
  content: string
  format: string
}

interface SongListData {
  songs: Song[]
  loading: boolean
  error: string | null
  init: () => Promise<void>
}

declare const Alpine: {
  data: (name: string, fn: () => SongListData) => void
}

document.addEventListener("alpine:init", () => {
  Alpine.data("songList", () => ({
    songs: [],
    loading: true,
    error: null,

    async init() {
      try {
        const res = await fetch("/api/songs")
        if (!res.ok) throw new Error(`HTTP ${String(res.status)}`)
        this.songs = (await res.json()) as Song[]
      } catch (err) {
        this.error = (err as Error).message
      } finally {
        this.loading = false
      }
    },
  }))
})
