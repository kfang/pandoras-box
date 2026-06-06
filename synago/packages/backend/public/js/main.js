"use strict";
(() => {
  // src/components/song-list.ts
  document.addEventListener("alpine:init", () => {
    Alpine.data("songList", () => ({
      songs: [],
      loading: true,
      error: null,
      async init() {
        try {
          const res = await fetch("/api/songs");
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          this.songs = await res.json();
        } catch (err) {
          this.error = err.message;
        } finally {
          this.loading = false;
        }
      }
    }));
  });

  // src/main.ts
  async function fetchSongs() {
    const res = await fetch("/api/songs");
    if (!res.ok) return [];
    return res.json();
  }
  async function createSong(data) {
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!res.ok) return null;
    return res.json();
  }
  document.addEventListener("alpine:init", () => {
    Alpine.data("app", () => ({
      view: "songs",
      songs: [],
      showAddForm: false,
      selectedSong: null,
      form: { title: "", artist: "", content: "", format: "chordpro" },
      async addSong() {
        const form = this.form;
        const song = await createSong(form);
        if (song) {
          ;
          this.songs.push(song);
          this.showAddForm = false;
          this.form = { title: "", artist: "", content: "", format: "chordpro" };
        }
      },
      selectSong(song) {
        this.selectedSong = song;
      }
    }));
    Alpine.data("songList", () => ({
      songs: [],
      async init() {
        this.songs = await fetchSongs();
      }
    }));
    Alpine.start();
  });
})();
