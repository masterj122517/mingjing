# 明镜 · Mingjing

> 以镜观己 — 智能学习计划管理器

一个基于 Rust + Tauri 构建的桌面应用。管理学习目标，拆解任务，通过 LLM 自动生成学习计划。

## Features

- **目标系统** — 创建学习目标（如"通过六级""学习 Rust"），跟踪进度
- **任务管理** — 标准 CRUD，支持优先级、标签、截止日期、分类
- **AI 学习计划** — 输入你的知识水平和目标，AI 自动拆解为 5-15 个结构化任务
- **AI 分析** — 一键分析当前进度，输出风险预警 + 进度总结
- **分类系统** — 用户自定义分类，Lucide 图标选择器
- **编辑模式** — 点击任务进入内联编辑，Todoist 风格迷你日历
- **动画交互** — 完成任务动画 + 叮咚音效，删除滑出 + 撤销 toast
- **离线可用** — 规则引擎本地预警，无 LLM 仍可工作
- **多模型支持** — 支持 DeepSeek/GPT/Claude/Kimi 等，API Key 本地加密存储

## Architecture

```
Frontend (Vanilla JS/HTML/CSS)
  │  invoke()
  ▼
Tauri 2 Commands (Rust)
  ├── SQLite (rusqlite) — 本地持久化
  ├── LLM API (reqwest) — DeepSeek/GPT/Claude/Kimi
  └── Rules Engine — 离线规则兜底
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 |
| Backend | Rust |
| Database | SQLite (`rusqlite`, bundled) |
| HTTP | `reqwest` |
| Crypto | AES-256-GCM (`ring`) |
| Frontend | Vanilla HTML/CSS/JS, LXGW WenKai font |
| LLM | OpenAI-compatible API (JSON mode) |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs)

### Run

```bash
git clone https://github.com/masterj-cn/mingjing.git
cd mingjing
cargo tauri dev
```

No `npm install` needed — this is a vanilla JS frontend with zero build step.

### AI Setup

1. Open the app → click "AI 分析" → "模型配置"
2. Select a model (DeepSeek recommended: `api.deepseek.com/v1`) and paste your API Key
3. Click "添加" → "选用"

## Project Structure

```
mingjing/
├── src/                          # Frontend (static)
│   ├── index.html / main.js / styles.css
│   ├── sound.js                  # Web Audio sound effects
│   ├── icons.js                  # Lucide SVG icons
│   └── assets/fonts/             # LXGW WenKai Lite
│
├── src-tauri/src/
│   ├── main.rs                   # Binary entry
│   ├── lib.rs                    # Tauri setup
│   ├── models.rs                 # Data structures
│   ├── db.rs                     # SQLite CRUD
│   ├── commands.rs               # Tauri commands
│   ├── llm.rs                    # LLM API client
│   ├── rules.rs                  # Offline rule engine
│   └── passkey.rs                # AES-256-GCM encryption
│
├── Cargo.toml
├── tauri.conf.json
├── AGENTS.md
└── docs.md
```

## Database

SQLite stored at app data directory:
- macOS: `~/Library/Application Support/com.masterj.mingjing/mingjing.db`

Tables: `goals`, `categories`, `todos`, `model_configs`, `suggestions`

## License

MIT
