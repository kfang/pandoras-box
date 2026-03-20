package importer

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/kfang/mnemosyne/internal/metadata"
	"github.com/kfang/mnemosyne/internal/thumbnail"
)

type Status struct {
	File    string `json:"file"`
	State   string `json:"state"` // "queued", "processing", "done", "error"
	Message string `json:"message,omitempty"`
}

type Importer struct {
	libraryDir string
	queue      chan string
	done       chan struct{}
	workers    int

	mu          sync.Mutex
	subscribers []chan Status
}

func New(libraryDir string, workers int) *Importer {
	imp := &Importer{
		libraryDir: libraryDir,
		queue:      make(chan string, 1000),
		done:       make(chan struct{}),
		workers:    workers,
	}

	for i := range workers {
		go imp.worker(i)
	}

	return imp
}

func (imp *Importer) Enqueue(path string) {
	imp.broadcast(Status{File: path, State: "queued"})
	imp.queue <- path
}

func (imp *Importer) Subscribe() chan Status {
	ch := make(chan Status, 100)
	imp.mu.Lock()
	imp.subscribers = append(imp.subscribers, ch)
	imp.mu.Unlock()
	return ch
}

func (imp *Importer) Unsubscribe(ch chan Status) {
	imp.mu.Lock()
	defer imp.mu.Unlock()
	for i, sub := range imp.subscribers {
		if sub == ch {
			imp.subscribers = append(imp.subscribers[:i], imp.subscribers[i+1:]...)
			close(ch)
			return
		}
	}
}

func (imp *Importer) broadcast(s Status) {
	imp.mu.Lock()
	defer imp.mu.Unlock()
	for _, ch := range imp.subscribers {
		select {
		case ch <- s:
		default:
		}
	}
}

func (imp *Importer) worker(id int) {
	for {
		select {
		case path := <-imp.queue:
			imp.processFile(path)
		case <-imp.done:
			return
		}
	}
}

func (imp *Importer) processFile(path string) {
	imp.broadcast(Status{File: path, State: "processing"})

	meta, err := metadata.Extract(path)
	if err != nil {
		imp.broadcast(Status{File: path, State: "error", Message: err.Error()})
		log.Printf("error extracting metadata from %s: %v", path, err)
		return
	}

	// Build destination: library/YYYY-MM-DD/filename
	dt := meta.DateTaken
	destDir := filepath.Join(
		imp.libraryDir,
		fmt.Sprintf("%d-%02d-%02d", dt.Year(), dt.Month(), dt.Day()),
	)

	if err := os.MkdirAll(destDir, 0755); err != nil {
		imp.broadcast(Status{File: path, State: "error", Message: err.Error()})
		return
	}

	filename := filepath.Base(path)
	destPath := filepath.Join(destDir, filename)

	if _, err := os.Stat(destPath); err == nil {
		// Destination exists — check if identical
		if filesEqual(path, destPath) {
			os.Remove(path)
			imp.broadcast(Status{File: path, State: "done", Message: "duplicate removed"})
			log.Printf("duplicate removed: %s", filepath.Base(path))
			return
		}
		imp.broadcast(Status{File: path, State: "error", Message: "destination exists but files differ"})
		log.Printf("conflict: %s already exists at %s with different content", filepath.Base(path), destPath)
		return
	}

	if err := os.Rename(path, destPath); err != nil {
		imp.broadcast(Status{File: path, State: "error", Message: err.Error()})
		return
	}

	// Generate thumbnail
	thumbDir := filepath.Join(imp.libraryDir, ".thumbnails")
	if err := os.MkdirAll(thumbDir, 0755); err == nil {
		thumbnail.Generate(destPath, thumbDir)
	}

	imp.broadcast(Status{File: path, State: "done", Message: destPath})
	log.Printf("imported %s -> %s", filepath.Base(path), destPath)
}

func filesEqual(pathA, pathB string) bool {
	infoA, errA := os.Stat(pathA)
	infoB, errB := os.Stat(pathB)
	if errA != nil || errB != nil || infoA.Size() != infoB.Size() {
		return false
	}

	fA, err := os.Open(pathA)
	if err != nil {
		return false
	}
	defer fA.Close()

	fB, err := os.Open(pathB)
	if err != nil {
		return false
	}
	defer fB.Close()

	bufA := make([]byte, 64*1024)
	bufB := make([]byte, 64*1024)
	for {
		nA, errA := fA.Read(bufA)
		nB, errB := fB.Read(bufB)
		if nA != nB || !bytes.Equal(bufA[:nA], bufB[:nB]) {
			return false
		}
		if errA == io.EOF && errB == io.EOF {
			return true
		}
		if errA != nil || errB != nil {
			return false
		}
	}
}

func (imp *Importer) Stop() {
	close(imp.done)
}
