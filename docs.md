# 明镜 · 项目现状

## 已完成的迭代

### Phase 3：模型配置 + API Key 加密

- [x] **AES-256-GCM 加密** — `passkey.rs`，用户可选设置主密码，API Key 加密存储
- [x] **model_configs 表** — name / provider / api_base / api_key / model_name / is_active
- [x] **Tauri commands** — create / list / update / delete 模型配置 + set_master_password / has_master_password / verify_master_password
- [x] **预配置模型列表**（DeepSeek V3/R1, GPT-4o, Claude, Kimi）+ 支持自定义

### Phase 2：目标系统 (Goals)

- [x] **goals 表** — title / description / created_at / target_date / status
- [x] **Goal CRUD** — create / list / update / complete / delete
- [x] **目标完成自动归档** — complete_goal 自动将关联任务标记为已完成；可 toggle 恢复
- [x] **Tauri commands** — create_goal / list_goals / update_goal / complete_goal / delete_goal
- [x] **前端目标选择器** — 快速添加区域增加目标下拉框（仅显示 active 状态目标）
- [x] **5 项单元测试** — todo CRUD + category CRUD + 分类删除级联 + goal CRUD + 目标完成归档

### Phase 1：SQLite 后端 + 前后端联通

- [x] **Rust 后端** — `models.rs` / `db.rs` / `commands.rs`
- [x] **SQLite 持久化** — goals + categories + todos 三张表
- [x] **Tauri commands** — 16 个命令（含迁移）
- [x] **前端 invoke** — 用 `window.__TAURI__.core.invoke()` 替换了 localStorage
- [x] **数据迁移** — 首次启动自动迁移旧 localStorage 数据到 SQLite

### 之前已完成

- [x] Todoist 风格 UI（侧边栏、任务列表、快速添加）
- [x] 完成/删除动画 + 音效（Web Audio API）
- [x] Toast 撤销（5 秒倒计时）
- [x] 4 个系统视图（全部/今天/计划中/已完成）
- [x] 优先级排序（高→低，同级截止时间近→远）
- [x] 荔枝文楷自建字体

---

## 架构

```
前端 (Vanilla JS / HTML / CSS)
  │  invoke('create_todo', { input })
  │  invoke('list_todos')
  │  invoke('update_todo', { id, input })
  │  invoke('complete_todo', { id })
  │  invoke('delete_todo', { id })
  │  invoke('create_category', { input })
  │  invoke('list_categories')
  │  invoke('update_category', { id, input })
  │  invoke('delete_category', { id })
  │  invoke('create_goal', { input })
  │  invoke('list_goals')
  │  invoke('update_goal', { id, input })
  │  invoke('complete_goal', { id })
  │  invoke('delete_goal', { id })
  │  invoke('migrate', { payload })
  ▼
Tauri 2 (Rust) — commands.rs
  │
  ├── db.rs — SQLite CRUD
  └── models.rs — 数据结构
```

---

## 数据库

### 位置

```
macOS:    ~/Library/Application Support/com.masterj.mingjing/mingjing.db
Windows:  C:\Users\<user>\AppData\Roaming\com.masterj.mingjing\mingjing.db
Linux:    ~/.local/share/com.masterj.mingjing/mingjing.db
```

### 表结构

```sql
-- 目标表
CREATE TABLE goals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at  TEXT NOT NULL,
  target_date TEXT,
  status      TEXT NOT NULL DEFAULT 'active'   -- active | completed
);

-- 分类表
CREATE TABLE categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'target'
);

-- 任务表
CREATE TABLE todos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium',
  tags          TEXT DEFAULT '',
  category_id   INTEGER DEFAULT NULL,
  goal_id       INTEGER DEFAULT NULL,
  created_at    TEXT NOT NULL,
  due_at        TEXT,
  completed_at  TEXT,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (goal_id) REFERENCES goals(id)
);
```

---

## 测试

```bash
cargo test  # 6 项通过: todo CRUD, category CRUD, 分类删除级联, goal CRUD, 目标完成归档, 迁移兼容
```

## 运行

```bash
cargo tauri dev        # 开发模式
cargo test             # 运行 Rust 单元测试（需在 src-tauri/ 下）
```

## 已知问题

- **SQLite 表结构变更**：`CREATE TABLE IF NOT EXISTS` 不会更新已有表。新增列必须用 `ALTER TABLE ADD COLUMN`，see `db.rs:init_db()` line 65
- **DB 位置**：数据库在 `~/Library/Application Support/com.masterj.mingjing/mingjing.db`，不在项目目录。调试时需删除该路径的旧 DB
