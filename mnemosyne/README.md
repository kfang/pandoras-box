# Mnemosyne

A cross-platform desktop application for organizing and sorting large photo libraries. Built with [Tauri](https://tauri.app), React, and TypeScript, with [exiftool](https://exiftool.org/) for metadata extraction.

## Prerequisites

### System dependencies

**Linux (Debian/Ubuntu):**

```bash
sudo apt install libwebkit2gtk-4.1-dev librsvg2-dev exiftool
```

**macOS:**

```bash
brew install exiftool
# Xcode Command Line Tools are also required
xcode-select --install
```

**Windows:**

- Install [exiftool](https://exiftool.org/) and ensure it's on your PATH
- Install [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed on Windows 10+)

### Development tools

This project uses [mise](https://mise.jdx.dev) to manage tool versions (Node.js, Rust).

```bash
# Install mise if you haven't already
# https://mise.jdx.dev/getting-started.html

# From the project directory, install tools and activate them
cd mnemosyne
mise install
```

## Getting started

```bash
# Install Node.js dependencies
npm install

# Start the app in development mode (hot-reloads frontend, rebuilds Rust on change)
npm run tauri dev
```

The dev server starts at `http://localhost:1420` and the Tauri window opens automatically.

## Building a release

```bash
npm run tauri build
```

This compiles the frontend, builds the Rust binary in release mode, and produces platform-specific installers:

| Platform | Output                                           |
| -------- | ------------------------------------------------ |
| Linux    | `.deb`, `.AppImage` in `src-tauri/target/release/bundle/` |
| macOS    | `.dmg`, `.app` in `src-tauri/target/release/bundle/`      |
| Windows  | `.msi`, `.exe` in `src-tauri\target\release\bundle\`      |

## Project structure

```
mnemosyne/
├── src/              # React + TypeScript frontend
├── src-tauri/        # Rust backend
│   └── src/
│       ├── main.rs   # App entry point
│       └── lib.rs    # Tauri commands
├── mise.toml         # Tool versions and tasks
├── vite.config.ts    # Vite bundler config
└── package.json
```

## IDE setup

Any editor with [rust-analyzer](https://rust-analyzer.github.io/) and TypeScript LSP support will work well.
