#!/usr/bin/env bash
set -euo pipefail

# Downloads exiftool and places it in src-tauri/binaries/ with the correct
# target-triple suffix so Tauri can bundle it as a sidecar.

EXIFTOOL_VERSION="${EXIFTOOL_VERSION:-13.53}"
BINARIES_DIR="$(cd "$(dirname "$0")/../src-tauri/binaries" && pwd)"

get_target_triple() {
    rustc -vV | grep '^host:' | awk '{print $2}'
}

TARGET_TRIPLE="$(get_target_triple)"
SF_BASE="https://sourceforge.net/projects/exiftool/files"

echo "Setting up exiftool ${EXIFTOOL_VERSION} for ${TARGET_TRIPLE}"

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

case "$TARGET_TRIPLE" in
    *windows*)
        ARCHIVE="exiftool-${EXIFTOOL_VERSION}_64.zip"
        URL="${SF_BASE}/${ARCHIVE}/download"
        echo "Downloading ${URL}..."
        curl -fSL -o "${TMPDIR}/${ARCHIVE}" "${URL}"
        unzip -o "${TMPDIR}/${ARCHIVE}" -d "${TMPDIR}"
        mv "${TMPDIR}/exiftool(-k).exe" "${BINARIES_DIR}/exiftool-${TARGET_TRIPLE}.exe"
        echo "Installed exiftool-${TARGET_TRIPLE}.exe"
        ;;
    *)
        # Linux and macOS: download the Perl distribution
        ARCHIVE="Image-ExifTool-${EXIFTOOL_VERSION}.tar.gz"
        URL="${SF_BASE}/${ARCHIVE}/download"
        echo "Downloading ${URL}..."
        curl -fSL -o "${TMPDIR}/${ARCHIVE}" "${URL}"
        tar xzf "${TMPDIR}/${ARCHIVE}" -C "${TMPDIR}"

        EXIFTOOL_DIR="${TMPDIR}/Image-ExifTool-${EXIFTOOL_VERSION}"

        # Create a self-contained wrapper script
        INSTALL_DIR="${BINARIES_DIR}/exiftool-dist"
        rm -rf "${INSTALL_DIR}"
        mkdir -p "${INSTALL_DIR}"
        cp -r "${EXIFTOOL_DIR}/lib" "${INSTALL_DIR}/"
        cp "${EXIFTOOL_DIR}/exiftool" "${INSTALL_DIR}/"

        # Create the sidecar wrapper that Tauri will execute
        cat > "${BINARIES_DIR}/exiftool-${TARGET_TRIPLE}" << 'WRAPPER'
#!/usr/bin/env perl
use strict;
use warnings;
use FindBin qw($RealBin);
use lib "$RealBin/exiftool-dist/lib";
require "$RealBin/exiftool-dist/exiftool";
WRAPPER
        chmod +x "${BINARIES_DIR}/exiftool-${TARGET_TRIPLE}"
        echo "Installed exiftool-${TARGET_TRIPLE} with bundled lib/"
        ;;
esac

echo "Done."
