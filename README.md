# 明镜 · Mingjing

> 以镜观己 —— 一个基于 Rust + Tauri 构建的智能学习计划管理系统

个人学习计划智能推荐与进度预警系统。记录任务、追踪执行情况，并通过 LLM 分析历史数据，生成进度预警与排期建议。

## ✨ 特性

- **任务管理**：标准 CRUD，支持优先级、标签、截止时间
- **智能分析**：调用 LLM API，基于历史数据生成风险预警与排期建议
- **强类型契约**：前后端、LLM 交互均通过 `serde` 强类型校验，而非脆弱的字符串解析
- **原生体验**：基于 Tauri，跨平台桌面应用，体积小、启动快

## 🏗 技术架构

```
┌─────────────┐      invoke()      ┌──────────────────┐
│   Frontend   │ ─────────────────▶ │  Rust Backend     │
│ (HTML/JS/CSS)│ ◀───────────────── │  (Tauri Commands)  │
└─────────────┘                    └─────────┬─────────┘
                                              │
                          ┌───────────────────┼───────────────────┐
                          ▼                                       ▼
                  ┌───────────────┐                    ┌──────────────────┐
                  │   SQLite       │                    │   LLM API         │
                  │ (rusqlite)     │                    │  (tool_use schema) │
                  └───────────────┘                    └──────────────────┘
```

### 数据流

1. 用户在前端创建/更新任务
2. 任务数据写入本地 SQLite
3. 触发分析时，将任务数据（含完成情况、延期记录）序列化为结构化 JSON
4. 调用 LLM API，通过 `tool_use` 强制约定返回 JSON Schema
5. 后端用 `serde` 反序列化为 Rust 结构体
6. 前端渲染风险预警、排期建议与周期总结

## 🔧 技术栈

| 层级 | 技术选型 |
|------|---------|
| 桌面框架 | Tauri |
| 后端逻辑 | Rust |
| 数据库 | SQLite (`rusqlite`) |
| 序列化 | `serde` / `serde_json` |
| 异步运行时 | `tokio` |
| HTTP 客户端 | `reqwest` |
| LLM 接入 | Claude API (Tool Use) |
| 前端 | HTML / CSS / JavaScript |

## 📦 数据结构

### 任务表 (`todos`)

```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  priority TEXT NOT NULL,   -- high / medium / low
  tags TEXT,
  created_at TEXT NOT NULL,
  due_at TEXT,
  completed_at TEXT
);
```

### LLM 返回 Schema

```json
{
  "risk_alerts": [
    { "todo_id": "...", "risk_level": "high|medium|low", "reason": "..." }
  ],
  "schedule_suggestions": [
    { "todo_id": "...", "suggested_time_slot": "...", "reason": "..." }
  ],
  "weekly_summary": "..."
}
```

## 🚀 快速开始

### 环境要求

- Rust（建议通过 `rustup` 安装）
- Node.js（用于 Tauri CLI 及前端依赖）
- Tauri CLI: `cargo install tauri-cli`

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/yourname/mingjing.git
cd mingjing

# 安装前端依赖
npm install

# 配置 API Key（不要硬编码，使用环境变量）
cp .env.example .env
# 编辑 .env，填入你的 LLM API Key

# 开发模式运行
cargo tauri dev

# 构建发布版本
cargo tauri build
```

## 📁 项目结构

```
mingjing/
├── src/                  # 前端代码
│   ├── index.html
│   ├── main.js
│   └── style.css
├── src-tauri/
│   ├── src/
│   │   ├── main.rs       # Tauri 入口
│   │   ├── db.rs         # 数据库操作
│   │   ├── commands.rs   # Tauri Commands
│   │   ├── llm.rs        # LLM API 调用与解析
│   │   └── models.rs     # 数据结构定义
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .env.example
└── README.md
```

## 🎯 设计亮点

- **契约优先设计**：LLM 输出通过 `tool_use` 强制 JSON Schema，避免自然语言输出导致的解析脆弱性
- **IPC 通信**：前后端通过 Tauri 原生 IPC 通信，而非 HTTP 请求，减少攻击面、提升性能
- **异步非阻塞**：LLM 调用通过 `tokio` 异步处理，不阻塞 UI 线程
- **关注分离**：预警逻辑（规则触发）与建议生成（LLM 推理）职责分离，降低系统对外部服务的强依赖

## 📝 License

MIT

---

*本项目为课程设计作业，用于实践 Rust 与 Tauri 桌面应用开发。*
