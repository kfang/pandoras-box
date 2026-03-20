package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/kfang/mnemosyne/internal/importer"
	"github.com/kfang/mnemosyne/internal/server"
	"github.com/kfang/mnemosyne/internal/watcher"
)

func main() {
	importDir := flag.String("import", "", "directory to watch for new photos")
	libraryDir := flag.String("library", "", "root directory of the photo library")
	addr := flag.String("addr", ":8080", "web server listen address")
	workers := flag.Int("workers", 4, "number of parallel import workers")
	flag.Parse()

	if *importDir == "" || *libraryDir == "" {
		flag.Usage()
		os.Exit(1)
	}

	absLibrary, err := filepath.Abs(*libraryDir)
	if err != nil {
		log.Fatalf("failed to resolve library path: %v", err)
	}

	imp := importer.New(absLibrary, *workers)
	w, err := watcher.New(*importDir, imp)
	if err != nil {
		log.Fatalf("failed to create watcher: %v", err)
	}

	srv := server.New(*addr, absLibrary, imp, w.Scan)

	go w.Start()
	go srv.Start()

	log.Printf("mnemosyne started: watching %s, library at %s, web at %s", *importDir, *libraryDir, *addr)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	w.Stop()
	srv.Stop()
}
