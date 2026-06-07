package server

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"math/bits"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/kfang/mnemosyne/internal/importer"
	"github.com/kfang/mnemosyne/internal/metadata"
	"github.com/kfang/mnemosyne/internal/thumbnail"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
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
	mux.HandleFunc("/api/rotate", s.handleRotate)
	mux.HandleFunc("/api/download", s.handleDownload)
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
		// Apply RAW orientation so the preview reflects the file's current EXIF state
		if angle := readOrientation(filePath); angle > 0 {
			if err := rotateFile(previewPath, angle); err != nil {
				log.Printf("failed to apply orientation to preview %s: %v", previewPath, err)
			}
		}
	}

	w.Header().Set("Cache-Control", "public, max-age=86400")
	http.ServeFile(w, r, previewPath)
}

// readOrientation reads the EXIF Orientation from a RAW file via exiftool
// and returns the corresponding rotation angle in degrees (0, 90, 180, 270).
func readOrientation(path string) int {
	out, err := exec.Command("exiftool", "-n", "-Orientation", "-b", path).Output()
	if err != nil || len(out) == 0 {
		return 0
	}
	val := 0
	fmt.Sscanf(string(out), "%d", &val)
	switch val {
	case 3:
		return 180
	case 6:
		return 90
	case 8:
		return 270
	default:
		return 0
	}
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

var rawExtensions = map[string]bool{
	".cr2": true, ".cr3": true, ".nef": true, ".arw": true,
	".raf": true, ".orf": true, ".rw2": true, ".dng": true,
	".pef": true, ".srw": true, ".x3f": true, ".iiq": true,
}

var videoExtensions = map[string]bool{
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

func (s *Server) handleRotate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		File  string `json:"file"`
		Angle int    `json:"angle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Angle != 90 && req.Angle != 180 && req.Angle != 270 {
		http.Error(w, "angle must be 90, 180, or 270", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(s.libraryDir, filepath.Clean("/"+req.File))
	if !strings.HasPrefix(filePath, s.libraryDir) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	if videoExtensions[ext] {
		http.Error(w, "cannot rotate video files", http.StatusBadRequest)
		return
	}

	if rawExtensions[ext] {
		orientation := map[int]string{90: "6", 180: "3", 270: "8"}[req.Angle]
		if out, err := exec.Command("exiftool", "-overwrite_original", "-n", "-Orientation="+orientation, filePath).CombinedOutput(); err != nil {
			log.Printf("failed to set EXIF orientation on %s: %s", filePath, string(out))
		}
		// Delete cached preview so it's re-extracted with orientation applied
		previewDir := filepath.Join(s.libraryDir, ".previews")
		os.Remove(thumbnail.PreviewPath(filePath, previewDir))
	} else {
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
			http.Error(w, "rotation not supported for this file type", http.StatusBadRequest)
			return
		}
		if err := rotateFile(filePath, req.Angle); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	os.Remove(thumbnail.ThumbPath(filePath, filepath.Join(s.libraryDir, ".thumbnails")))

	w.WriteHeader(http.StatusOK)
}

func rotateFile(path string, angle int) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("failed to open: %w", err)
	}
	defer f.Close()

	src, format, err := image.Decode(f)
	if err != nil {
		return fmt.Errorf("failed to decode: %w", err)
	}
	f.Close()

	rotated := rotateImage(src, angle)

	out, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("failed to create: %w", err)
	}
	defer out.Close()

	switch format {
	case "jpeg":
		return jpeg.Encode(out, rotated, &jpeg.Options{Quality: 95})
	case "png":
		return png.Encode(out, rotated)
	default:
		return fmt.Errorf("unsupported image format: %s", format)
	}
}

func rotateImage(src image.Image, angle int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()

	switch angle {
	case 90:
		dst := image.NewRGBA(image.Rect(0, 0, h, w))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(h-1-y, x, src.At(b.Min.X+x, b.Min.Y+y))
			}
		}
		return dst
	case 180:
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(w-1-x, h-1-y, src.At(b.Min.X+x, b.Min.Y+y))
			}
		}
		return dst
	case 270:
		dst := image.NewRGBA(image.Rect(0, 0, h, w))
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				dst.Set(y, w-1-x, src.At(b.Min.X+x, b.Min.Y+y))
			}
		}
		return dst
	default:
		return src
	}
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Files  []string `json:"files"`
		Format string   `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Format != "raw" && req.Format != "jpeg" {
		http.Error(w, "format must be 'raw' or 'jpeg'", http.StatusBadRequest)
		return
	}

	if len(req.Files) == 0 {
		http.Error(w, "no files specified", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\"mnemosyne-"+req.Format+".zip\"")

	zw := zip.NewWriter(w)
	defer zw.Close()

	for _, relPath := range req.Files {
		filePath := filepath.Join(s.libraryDir, filepath.Clean("/"+relPath))
		if !strings.HasPrefix(filePath, s.libraryDir) {
			continue
		}

		ext := strings.ToLower(filepath.Ext(filePath))

		if req.Format == "raw" {
			if rawExtensions[ext] {
				addFileToZip(zw, filePath, relPath)
				xmpPath := filePath[:len(filePath)-len(ext)] + ".xmp"
				if _, err := os.Stat(xmpPath); err == nil {
					xmpRel := relPath[:len(relPath)-len(ext)] + ".xmp"
					addFileToZip(zw, xmpPath, xmpRel)
				}
			} else if !videoExtensions[ext] {
				addFileToZip(zw, filePath, relPath)
			}
		} else {
			if rawExtensions[ext] {
				previewDir := filepath.Join(s.libraryDir, ".previews")
				previewPath := thumbnail.PreviewPath(filePath, previewDir)
				if _, err := os.Stat(previewPath); err != nil {
					os.MkdirAll(previewDir, 0755)
					metadata.ExtractPreview(filePath, previewPath)
				}
				if _, err := os.Stat(previewPath); err == nil {
					jpegRel := relPath[:len(relPath)-len(ext)] + ".jpg"
					addFileToZip(zw, previewPath, jpegRel)
				}
			} else if !videoExtensions[ext] {
				addFileToZip(zw, filePath, relPath)
			}
		}
	}
}

func addFileToZip(zw *zip.Writer, srcPath, name string) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	fi, err := f.Stat()
	if err != nil {
		return err
	}

	h, err := zip.FileInfoHeader(fi)
	if err != nil {
		return err
	}
	h.Name = name
	h.Method = zip.Store

	w, err := zw.CreateHeader(h)
	if err != nil {
		return err
	}

	_, err = io.Copy(w, f)
	return err
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
