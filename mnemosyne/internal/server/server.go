package server

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/kfang/mnemosyne/internal/importer"
	"github.com/kfang/mnemosyne/internal/thumbnail"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type ScanFunc func()

type Server struct {
	addr       string
	libraryDir string
	importer   *importer.Importer
	scanFn     ScanFunc
	srv        *http.Server
}

func New(addr, libraryDir string, imp *importer.Importer, scanFn ScanFunc) *Server {
	s := &Server{
		addr:       addr,
		libraryDir: libraryDir,
		importer:   imp,
		scanFn:     scanFn,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/browse", s.handleBrowse)
	mux.HandleFunc("/api/thumbnail/", s.handleThumbnail)
	mux.HandleFunc("/api/scan", s.handleScan)
	mux.HandleFunc("/ws", s.handleWebSocket)
	mux.Handle("/", http.FileServer(http.Dir("web")))

	s.srv = &http.Server{Addr: addr, Handler: mux}
	return s
}

type browseEntry struct {
	Name  string `json:"name"`
	IsDir bool   `json:"isDir"`
}

func (s *Server) handleBrowse(w http.ResponseWriter, r *http.Request) {
	relPath := r.URL.Query().Get("path")
	dir := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))

	// Prevent traversal outside library
	if !strings.HasPrefix(dir, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	var result []browseEntry
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		result = append(result, browseEntry{
			Name:  e.Name(),
			IsDir: e.IsDir(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Server) handleThumbnail(w http.ResponseWriter, r *http.Request) {
	// /api/thumbnail/{relative path to file in library}
	relPath := strings.TrimPrefix(r.URL.Path, "/api/thumbnail/")
	filePath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))

	// Prevent traversal outside library
	if !strings.HasPrefix(filePath, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	thumbDir := filepath.Join(s.libraryDir, ".thumbnails")
	thumbPath := thumbnail.ThumbPath(filePath, thumbDir)

	if _, err := os.Stat(thumbPath); err != nil {
		// Thumbnail doesn't exist yet, generate on demand
		thumbnail.Generate(filePath, thumbDir)
	}

	if _, err := os.Stat(thumbPath); err != nil {
		http.Error(w, "thumbnail not available", http.StatusNotFound)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, thumbPath)
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	go s.scanFn()
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	ch := s.importer.Subscribe()
	defer s.importer.Unsubscribe(ch)

	for status := range ch {
		data, err := json.Marshal(status)
		if err != nil {
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

func (s *Server) Start() {
	log.Printf("web server listening on %s", s.addr)
	if err := s.srv.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("web server error: %v", err)
	}
}

func (s *Server) Stop() {
	s.srv.Close()
}
