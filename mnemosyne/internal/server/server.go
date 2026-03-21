package server

import (
	"encoding/json"
	"image"
	"image/jpeg"
	"log"
	"math/bits"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/kfang/mnemosyne/internal/importer"
	"github.com/kfang/mnemosyne/internal/metadata"
	"github.com/kfang/mnemosyne/internal/thumbnail"
	"golang.org/x/image/draw"
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
	mux.HandleFunc("/api/file/", s.handleFile)
	mux.HandleFunc("/api/preview/", s.handlePreview)
	mux.HandleFunc("/api/duplicates", s.handleDuplicates)
	mux.HandleFunc("/api/scan", s.handleScan)
	mux.HandleFunc("/api/trash", s.handleTrash)
	mux.HandleFunc("/api/trash/empty", s.handleEmptyTrash)
	mux.HandleFunc("/api/trash/restore", s.handleRestore)
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

func (s *Server) handleFile(w http.ResponseWriter, r *http.Request) {
	relPath := strings.TrimPrefix(r.URL.Path, "/api/file/")
	filePath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))

	if !strings.HasPrefix(filePath, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	http.ServeFile(w, r, filePath)
}

func (s *Server) handlePreview(w http.ResponseWriter, r *http.Request) {
	relPath := strings.TrimPrefix(r.URL.Path, "/api/preview/")
	filePath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))

	if !strings.HasPrefix(filePath, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	previewDir := filepath.Join(s.libraryDir, ".previews")
	previewPath := thumbnail.PreviewPath(filePath, previewDir)

	if _, err := os.Stat(previewPath); err != nil {
		if err := os.MkdirAll(previewDir, 0755); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if err := metadata.ExtractPreview(filePath, previewPath); err != nil {
			http.Error(w, "preview not available", http.StatusNotFound)
			return
		}
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, previewPath)
}

func (s *Server) handleScan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	go s.scanFn()
	w.WriteHeader(http.StatusAccepted)
}

func (s *Server) handleTrash(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Files []string `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	trashDir := filepath.Join(s.libraryDir, ".trash")

	var errors []string
	for _, relPath := range req.Files {
		srcPath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))
		if !strings.HasPrefix(srcPath, s.libraryDir) {
			errors = append(errors, relPath+": forbidden")
			continue
		}

		// Preserve folder structure in trash
		destPath := filepath.Join(trashDir, filepath.Clean("/"+relPath))
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			errors = append(errors, relPath+": "+err.Error())
			continue
		}

		if err := os.Rename(srcPath, destPath); err != nil {
			errors = append(errors, relPath+": "+err.Error())
			continue
		}
		removeEmptyParents(filepath.Dir(srcPath), s.libraryDir)
	}

	resp := struct {
		Trashed int      `json:"trashed"`
		Errors  []string `json:"errors,omitempty"`
	}{
		Trashed: len(req.Files) - len(errors),
		Errors:  errors,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Files []string `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	trashDir := filepath.Join(s.libraryDir, ".trash")

	var errors []string
	for _, relPath := range req.Files {
		srcPath := filepath.Join(trashDir, filepath.Clean("/"+relPath))
		if !strings.HasPrefix(srcPath, trashDir) {
			errors = append(errors, relPath+": forbidden")
			continue
		}

		destPath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			errors = append(errors, relPath+": "+err.Error())
			continue
		}

		if err := os.Rename(srcPath, destPath); err != nil {
			errors = append(errors, relPath+": "+err.Error())
			continue
		}
		removeEmptyParents(filepath.Dir(srcPath), trashDir)
	}

	resp := struct {
		Restored int      `json:"restored"`
		Errors   []string `json:"errors,omitempty"`
	}{
		Restored: len(req.Files) - len(errors),
		Errors:   errors,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleEmptyTrash(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	trashDir := filepath.Join(s.libraryDir, ".trash")
	if err := os.RemoveAll(trashDir); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

var mediaExtensions = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".tiff": true, ".tif": true,
	".webp": true, ".heic": true, ".heif": true, ".avif": true,
	".cr2": true, ".cr3": true, ".nef": true, ".arw": true,
	".raf": true, ".orf": true, ".rw2": true, ".dng": true,
	".pef": true, ".srw": true, ".x3f": true, ".iiq": true,
	".mov": true, ".mp4": true, ".avi": true, ".mkv": true,
	".mts": true, ".m2ts": true, ".wmv": true, ".webm": true,
	".m4v": true,
}

func (s *Server) handleDuplicates(w http.ResponseWriter, r *http.Request) {
	relPath := r.URL.Query().Get("path")
	dir := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))

	if !strings.HasPrefix(dir, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	thumbDir := filepath.Join(s.libraryDir, ".thumbnails")

	type fileEntry struct {
		absPath string
		relPath string
		hash    uint64
	}

	// Walk directory, compute dHash for each media file's thumbnail
	var files []fileEntry
	filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() && strings.HasPrefix(info.Name(), ".") {
			return filepath.SkipDir
		}
		if info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(info.Name()))
		if !mediaExtensions[ext] {
			return nil
		}
		thumbPath := thumbnail.ThumbPath(path, thumbDir)
		// Generate thumbnail on demand if missing
		if _, err := os.Stat(thumbPath); err != nil {
			thumbnail.Generate(path, thumbDir)
		}
		h, err := dHash(thumbPath)
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(s.libraryDir, path)
		files = append(files, fileEntry{absPath: path, relPath: rel, hash: h})
		return nil
	})

	// Union-Find to cluster visually similar images
	parent := make([]int, len(files))
	for i := range parent {
		parent[i] = i
	}
	var find func(int) int
	find = func(i int) int {
		if parent[i] != i {
			parent[i] = find(parent[i])
		}
		return parent[i]
	}
	union := func(i, j int) {
		pi, pj := find(i), find(j)
		if pi != pj {
			parent[pi] = pj
		}
	}

	threshold := 10
	if t, err := strconv.Atoi(r.URL.Query().Get("threshold")); err == nil && t >= 0 && t <= 64 {
		threshold = t
	}
	for i := 0; i < len(files); i++ {
		for j := i + 1; j < len(files); j++ {
			if hammingDist(files[i].hash, files[j].hash) <= threshold {
				union(i, j)
			}
		}
	}

	// Collect groups
	clusters := map[int][]string{}
	for i, f := range files {
		root := find(i)
		clusters[root] = append(clusters[root], f.relPath)
	}

	type dupGroup struct {
		Files []string `json:"files"`
	}
	var groups []dupGroup
	for _, g := range clusters {
		if len(g) >= 2 {
			groups = append(groups, dupGroup{Files: g})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

// dHash computes a 64-bit difference hash from a JPEG thumbnail.
// The image is resized to 9x8 grayscale, then each pixel is compared
// to its right neighbor to produce a 64-bit perceptual fingerprint.
func dHash(imagePath string) (uint64, error) {
	f, err := os.Open(imagePath)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	img, err := jpeg.Decode(f)
	if err != nil {
		return 0, err
	}

	gray := image.NewGray(image.Rect(0, 0, 9, 8))
	draw.ApproxBiLinear.Scale(gray, gray.Bounds(), img, img.Bounds(), draw.Over, nil)

	var hash uint64
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			if gray.GrayAt(x, y).Y > gray.GrayAt(x+1, y).Y {
				hash |= 1 << uint(y*8+x)
			}
		}
	}
	return hash, nil
}

func hammingDist(a, b uint64) int {
	return bits.OnesCount64(a ^ b)
}

// removeEmptyParents removes empty directories walking up from dir, stopping at stopAt.
func removeEmptyParents(dir, stopAt string) {
	for dir != stopAt && strings.HasPrefix(dir, stopAt) {
		entries, err := os.ReadDir(dir)
		if err != nil || len(entries) > 0 {
			return
		}
		os.Remove(dir)
		dir = filepath.Dir(dir)
	}
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
