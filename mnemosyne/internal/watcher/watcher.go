package watcher

import (
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/kfang/mnemosyne/internal/importer"
)

var supportedExtensions = map[string]bool{
	// RAW formats
	".cr2": true, ".cr3": true, ".nef": true, ".arw": true,
	".raf": true, ".orf": true, ".rw2": true, ".dng": true,
	".pef": true, ".srw": true, ".x3f": true, ".iiq": true,
	// Standard image formats
	".jpg": true, ".jpeg": true, ".png": true, ".tiff": true,
	".tif": true, ".webp": true, ".heic": true, ".heif": true,
	".avif": true,
	// Video formats
	".mov": true, ".mp4": true, ".avi": true, ".mkv": true,
	".mts": true, ".m2ts": true, ".wmv": true, ".webm": true,
	".m4v": true,
}

type Watcher struct {
	fsw      *fsnotify.Watcher
	dir      string
	importer *importer.Importer
	done     chan struct{}
	pending  sync.Map // tracks files being written
}

func New(dir string, imp *importer.Importer) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	if err := fsw.Add(dir); err != nil {
		fsw.Close()
		return nil, err
	}

	return &Watcher{
		fsw:      fsw,
		dir:      dir,
		importer: imp,
		done:     make(chan struct{}),
	}, nil
}

func (w *Watcher) Start() {
	for {
		select {
		case event, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
				ext := strings.ToLower(filepath.Ext(event.Name))
				if supportedExtensions[ext] {
					w.waitForStable(event.Name)
				}
			}
		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)
		case <-w.done:
			return
		}
	}
}

// waitForStable debounces events for a file, only enqueuing it once
// the file size has stopped changing for 1 second.
func (w *Watcher) waitForStable(path string) {
	if _, loaded := w.pending.LoadOrStore(path, true); loaded {
		return // already waiting on this file
	}

	go func() {
		defer w.pending.Delete(path)

		var lastSize int64 = -1
		for {
			select {
			case <-w.done:
				return
			case <-time.After(1 * time.Second):
			}

			info, err := os.Stat(path)
			if err != nil {
				log.Printf("file disappeared while waiting: %s", path)
				return
			}

			size := info.Size()
			if size == lastSize {
				w.importer.Enqueue(path)
				return
			}
			lastSize = size
		}
	}()
}

// Scan walks the import directory and enqueues all supported files.
func (w *Watcher) Scan() {
	filepath.Walk(w.dir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if supportedExtensions[ext] {
			w.importer.Enqueue(path)
		}
		return nil
	})
}

func (w *Watcher) Stop() {
	close(w.done)
	w.fsw.Close()
}
