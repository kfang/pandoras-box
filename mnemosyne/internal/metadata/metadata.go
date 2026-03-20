package metadata

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"time"
)

type ImageMeta struct {
	DateTaken time.Time
	CameraMake  string
	CameraModel string
}

// Extract reads EXIF metadata from a file using exiftool.
func Extract(path string) (*ImageMeta, error) {
	cmd := exec.Command("exiftool", "-json", "-DateTimeOriginal", "-Make", "-Model", path)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("exiftool failed for %s: %w", path, err)
	}

	var results []map[string]interface{}
	if err := json.Unmarshal(out, &results); err != nil {
		return nil, fmt.Errorf("failed to parse exiftool output: %w", err)
	}

	if len(results) == 0 {
		return nil, fmt.Errorf("no metadata found for %s", path)
	}

	meta := &ImageMeta{}
	r := results[0]

	if dt, ok := r["DateTimeOriginal"].(string); ok {
		parsed, err := time.Parse("2006:01:02 15:04:05", dt)
		if err == nil {
			meta.DateTaken = parsed
		}
	}

	if make_, ok := r["Make"].(string); ok {
		meta.CameraMake = make_
	}
	if model, ok := r["Model"].(string); ok {
		meta.CameraModel = model
	}

	return meta, nil
}

var previewTags = []string{"PreviewImage", "JpgFromRaw", "OtherImage", "ThumbnailImage"}

// ExtractPreview extracts the embedded JPEG preview from a RAW file,
// trying multiple EXIF tags as fallbacks.
func ExtractPreview(path, destPath string) error {
	for _, tag := range previewTags {
		cmd := exec.Command("exiftool", "-b", "-"+tag, path)
		out, err := cmd.Output()
		if err == nil && len(out) > 0 {
			return os.WriteFile(destPath, out, 0644)
		}
	}
	return fmt.Errorf("no embedded preview found in %s", path)
}
