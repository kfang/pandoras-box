package main

import (
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"

	"github.com/kfang/mnemosyne/internal/importer"
	"github.com/kfang/mnemosyne/internal/server"
	"github.com/kfang/mnemosyne/internal/watcher"
)

func main() {
	importDir := envRequired("MNEMOSYNE_IMPORT_DIR")
	libraryDir := envRequired("MNEMOSYNE_LIBRARY_DIR")
	addr := envDefault("MNEMOSYNE_ADDR", ":8080")
	workers := envDefaultInt("MNEMOSYNE_WORKERS", 4)

	absLibrary, err := filepath.Abs(libraryDir)
	if err != nil {
		log.Fatalf("failed to resolve library path: %v", err)
	}

	imp := importer.New(absLibrary, workers)
	w, err := watcher.New(importDir, imp)
	if err != nil {
		log.Fatalf("failed to create watcher: %v", err)
	}

	srv := server.New(addr, absLibrary, imp, w.Scan)

	go w.Start()
	go srv.Start()

	log.Printf("mnemosyne started: watching %s, library at %s, web at %s", importDir, absLibrary, addr)

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("shutting down...")
	w.Stop()
	srv.Stop()
}

func envRequired(key string) string {
	val := os.Getenv(key)
	if val == "" {
		log.Fatalf("required environment variable %s is not set", key)
	}
	return val
}

func envDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func envDefaultInt(key string, fallback int) int {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		log.Fatalf("environment variable %s must be an integer: %v", key, err)
	}
	return n
}
