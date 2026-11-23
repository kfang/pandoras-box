package main

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/zeebo/xxh3"
)

const BaseDir = "/mnt/f/Books/"

func walk(path string, d fs.DirEntry, err error) error {
	if err != nil {
		return err
	}

	if d.IsDir() {
		return nil
	}

	if filepath.Ext(path) == ".cbz" {
		fmt.Println(path)
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()

		h := xxh3.New()
		if _, err := io.Copy(h, f); err != nil {
			return err
		}

		hexHash := fmt.Sprintf("%032x\n", h.Sum128())
		fmt.Println(hexHash)
	}

	return nil
}

func main() {
	fmt.Println("Hello World!")

	err := filepath.WalkDir(BaseDir, walk)
	if err != nil {
		panic(err)
	}
}
