# Gitea Desktop (MVP)

This is an Electron-based cross-platform desktop app targeting a "GitHub Desktop-like" workflow for Gitea.

---

## Build Status:

[![Build & Release](https://github.com/FOUNDATION-AI-BASED/gitea-desktop/actions/workflows/release.yml/badge.svg)](https://github.com/FOUNDATION-AI-BASED/gitea-desktop/actions/workflows/release.yml)


---

## Features

`✓` = implemented / `✗` = not implemented

`✓` in Tested = manually verified in dev / `✗` = not manually verified yet

| Feature | Implemented | Tested |
| --- | :---: | :---: |
| Login with personal access token | ✓ | ✗ |
| Login with username + password (token created) | ✓ | ✗ |
| Login with browser OAuth (PKCE) | ✓ | ✗ |
| List repositories for the signed-in account | ✓ | ✗ |
| Refresh repositories from server | ✓ | ✗ |
| Create repository (owner, name, description, public/private) | ✓ | ✗ |
| Clone selected repository (HTTPS/SSH) | ✓ | ✗ |
| Publish local folder to selected repository | ✓ | ✗ |
| Publish commit title + description | ✓ | ✗ |
| Publish progress/status bar | ✓ | ✗ |
| Local repo status (`git status --porcelain=v2`) | ✓ | ✗ |


## MACOS!!

The prebuild macos app requires you to self sign it!

For that use the following command and execute the it in the terminal:

```bash
xattr -cr /Applications/Gitea\ Desktop.app
```

Setup guides will follow soon.

## Prerequisites

- Node.js 20+ (recommended)
- Git installed and available on PATH (`git --version`)

## Development (Windows / Linux / macOS)

```bash
npm install
npm run dev
```

## Build (unpacked)

```bash
npm run build
```

## Package installers

```bash
npm run dist
```

Outputs go to `dist/` and `dist-electron/` and the installer artifacts under the Electron Builder output directory.

## Building for each OS

### Windows (from Windows)

- Run `npm run dist` to produce an NSIS installer.

### macOS (must run on macOS)

Apple requires macOS to produce `.app`/DMG builds.

- On a Mac: `npm install && npm run dist`
- For code signing/notarization you must add Apple signing identities and configure Electron Builder.

### Linux

- On Linux: `npm install && npm run dist` to produce AppImage/deb
- Cross-compiling Linux from Windows is not reliably supported for all targets; use a Linux machine/VM/CI for best results.

---

## Feature requests or bug reports are welcome!

Open a new issue and well evaluate it and take care of it.

---

Built with TraeAI.

Built with ChatGPT 5.2.
