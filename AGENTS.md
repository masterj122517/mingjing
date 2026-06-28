# AGENTS.md — 明镜 (Mingjing)

## Quick start
- `cargo tauri dev` — builds Rust backend + serves frontend, opens desktop window
- `cargo test` — run Rust unit tests (6 tests in `db.rs`); works from project root or `src-tauri/`
- No `npm install` — vanilla JS frontend, no Node build step

## Architecture
- **Tauri 2** with vanilla HTML/CSS/JS frontend (no framework, no bundler)
- `src/` — web frontend root (served raw per `tauri.conf.json` → `frontendDist: "../src"`)
- `src-tauri/src/lib.rs` — Tauri setup, command registration, `run()` entry
- `src-tauri/src/main.rs` — binary entry, calls `mingjing_lib::run()`
- Library crate is named `mingjing_lib` (not `mingjing`) to avoid Windows name conflict
- Backend layers: `models.rs` (structs) → `db.rs` (SQLite CRUD) → `commands.rs` (Tauri commands) → `lib.rs` (registration)
- LLM integration in `llm.rs`, offline rule engine in `rules.rs`, AES-256-GCM encryption in `passkey.rs`

## Tauri 2 specifics
- Frontend invokes Rust via `const { invoke } = window.__TAURI__.core;`
- Commands registered with `tauri::generate_handler![]` macro in `lib.rs`
- Async commands (`async fn`) are natively supported
- Permission model: capabilities defined in `src-tauri/capabilities/default.json`
- CSP is `null` (unrestricted, dev convenience)
- `State<Mutex<Connection>>` is shared SQLite connection; commands lock, operate, unlock

## Database (SQLite via `rusqlite` with `bundled` feature)
- **Location**: app data directory, NOT project directory
  - macOS: `~/Library/Application Support/com.masterj.mingjing/mingjing.db`
  - Windows: `C:\Users\<user>\AppData\Roaming\com.masterj.mingjing\`
  - Linux: `~/.local/share/com.masterj.mingjing/`
- **WAL mode** enabled (`PRAGMA journal_mode=WAL`). Do NOT place the DB in the project directory — WAL's `.db-shm` file triggers Tauri's file watcher, causing infinite rebuild loops.
- Tables: `goals`, `categories`, `todos`, `model_configs`, `suggestions`
- **Schema migration critical rule**: `CREATE TABLE IF NOT EXISTS` does NOT update existing tables. Every new column must use `ALTER TABLE ADD COLUMN` with `.ok()` for idempotency. See `debug.md` for a past outage caused by this.
- First launch auto-migrates old `localStorage` data via the `migrate` Tauri command.
- To reset: delete the DB file at the app data path above, then restart.

## Frontend flow gotchas
- `main.js` `loadData()` uses `invoke()` to fetch all data on startup. If it throws unhandled, the entire UI becomes static (no event listeners registered).
- All event listener registrations happen BEFORE `await loadData()` to prevent this.
- The `migrate` command fires only when DB is empty (no todos, no categories) on first launch.

## Encryption / passkey
- User sets a master password via `set_master_password`. API keys in `model_configs` are AES-256-GCM encrypted with a key derived from this password (SHA-256).
- If no master password is set, passkey is skipped and API keys are stored as plaintext.
- `re_encrypt_all` handles password changes.

## Conventions
- All UI, comments, and docs in Chinese
- `plan.md` is gitignored (development roadmap)

## Companion docs
- `docs.md` — full architecture, database schema, test commands, known issues
- `debug.md` — historical bugs and root cause analysis (schema migration, WAL rebuild loop, loadData crash)
