# AGENTS.md — 明镜 (Mingjing)

## Quick start
- `cargo tauri dev` — builds Rust backend + serves frontend, opens desktop window
- No `npm install` — this is a vanilla JS frontend, no Node build step

## Architecture
- **Tauri 2** with vanilla HTML/CSS/JS frontend (no framework, no bundler)
- `src/` — web frontend root (served raw per `tauri.conf.json` → `frontendDist: "../src"`)
- `src-tauri/src/lib.rs` — Tauri app setup, command registration, `run()` entry
- `src-tauri/src/main.rs` — binary entry, calls `mingjing_lib::run()`
- Library crate is named `mingjing_lib` (not `mingjing`) to avoid Windows name conflict

## Tauri 2 specifics
- Frontend invokes Rust via `const { invoke } = window.__TAURI__.core;`
- Commands registered with `tauri::generate_handler![]` macro in `lib.rs`
- Async commands (`async fn`) are natively supported
- Permission model: capabilities defined in `src-tauri/capabilities/default.json`
- CSP is `null` (unrestricted, dev convenience)

## Current state
- Pure frontend app: mock data in `main.js` with `localStorage` persistence
- `src/sound.js` — Web Audio API sound effects (completion ding + deletion swoosh)
- `src/icons.js` — 20 Lucide-style SVG icon definitions (not currently wired into UI)
- CSS uses LXGW WenKai Lite font (self-hosted in `src/assets/fonts/`)
- No database or Rust backend logic wired yet

## Conventions
- All UI, comments, and docs in Chinese
- `plan.md` is gitignored (development roadmap, not part of the deliverable)
