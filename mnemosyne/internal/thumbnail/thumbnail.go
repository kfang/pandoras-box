package thumbnail

import (
	"crypto/sha256"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/kfang/mnemosyne/internal/metadata"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

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

// ThumbPath returns the expected thumbnail path for a given source file.
func ThumbPath(srcPath, thumbDir string) string {
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(srcPath)))
	return filepath.Join(thumbDir, hash[:16]+".jpg")
}

// PreviewPath returns the expected preview path for a given source file.
func PreviewPath(srcPath, previewDir string) string {
	hash := fmt.Sprintf("%x", sha256.Sum256([]byte(srcPath)))
	return filepath.Join(previewDir, hash[:16]+"_full.jpg")
}

// Generate creates a JPEG thumbnail for the given image file.
func Generate(srcPath, thumbDir string) {
	thumbPath := ThumbPath(srcPath, thumbDir)

	ext := strings.ToLower(filepath.Ext(srcPath))

	if videoExtensions[ext] {
		if err := metadata.ExtractPreview(srcPath, thumbPath); err != nil {
			generateVideoThumb(srcPath, thumbPath)
		}
		return
	}

	// For RAW files, extract the embedded preview first
	if rawExtensions[ext] {
		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(srcPath)))
		previewPath := filepath.Join(thumbDir, hash[:16]+"_preview.jpg")
		if err := metadata.ExtractPreview(srcPath, previewPath); err == nil {
			srcPath = previewPath
		} else {
			log.Printf("no embedded preview in %s, skipping thumbnail: %v", srcPath, err)
			return
		}
	}

	f, err := os.Open(srcPath)
	if err != nil {
		log.Printf("failed to open %s for thumbnail: %v", srcPath, err)
		return
	}
	defer f.Close()

	src, _, err := image.Decode(f)
	if err != nil {
		log.Printf("failed to decode %s for thumbnail: %v", srcPath, err)
		return
	}

	// Scale to 400px wide, preserving aspect ratio
	bounds := src.Bounds()
	width := 400
	height := int(float64(bounds.Dy()) * (float64(width) / float64(bounds.Dx())))
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

	out, err := os.Create(thumbPath)
	if err != nil {
		log.Printf("failed to create thumbnail %s: %v", thumbPath, err)
		return
	}
	defer out.Close()

	if err := jpeg.Encode(out, dst, &jpeg.Options{Quality: 80}); err != nil {
		log.Printf("failed to encode thumbnail %s: %v", thumbPath, err)
	}
}

func generateVideoThumb(srcPath, thumbPath string) {
	cmd := exec.Command("ffmpeg",
		"-i", srcPath,
		"-ss", "00:00:01",
		"-vframes", "1",
		"-vf", "scale=400:-1",
		"-q:v", "5",
		"-y",
		thumbPath,
	)
	if err := cmd.Run(); err != nil {
		log.Printf("failed to generate video thumbnail for %s: %v", srcPath, err)
	}
}
