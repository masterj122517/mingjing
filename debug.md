# 明镜 · Debug Log

## 2026-06-26 — SQLite schema 迁移缺失导致任务创建失败

**现象**：Phase 2 完成后无法创建任务，前端无报错提示。

**根因**：`CREATE TABLE IF NOT EXISTS` 不更新已有表结构。Phase 1 创建的 `todos` 表缺少 `goal_id` 列，Phase 2 的 INSERT/SELECT 引用该列时失败。

**旧 DB 位置**：`~/Library/Application Support/com.masterj.mingjing/mingjing.db`（不在项目目录中）。

**修复**：
- `db.rs:init_db()` 添加 `ALTER TABLE todos ADD COLUMN goal_id INTEGER DEFAULT NULL` 迁移，用 `.ok()` 幂等化
- 删除 app_data_dir 中的旧 DB

**预防**：见 `docs.md` "已知问题" — 每次表结构变更必须加 `ALTER TABLE` 迁移。

---

## 2026-06-26 — `mingjing.db-shm` 导致 Tauri dev 无限重启循环

**现象**：`cargo tauri dev` 不断打印 "File changed. Rebuilding..." 循环。

**根因**：DB 路径在 `src-tauri/mingjing.db`，WAL 模式产生的 `.db-shm` 文件被 Tauri 文件监听器检测到，触发无限重建。

**修复**：DB 路径改为 `app.path().app_data_dir()`，文件监听范围外。

---

## 2026-06-26 — `loadData()` 异常导致全部功能无响应

**现象**：窗口打开但无法点击、无法切换视图、无法创建任务。

**根因**：`DOMContentLoaded` 回调中 `await loadData()` 如果 `invoke()` 调用失败（DB 未初始化等原因），异常未被捕获 → 后续事件监听全部未注册 → 页面呈静态死页。

**修复**：
- 所有事件监听注册移至 `await loadData()` 之前
- `loadData()` 包 try/catch
- 新增 `#error-banner` UI 提示
