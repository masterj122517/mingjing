use crate::models::*;
use rusqlite::{params, Connection, Result as SqlResult};

#[derive(Debug)]
pub enum DbError {
    NotFound(String),
    Database(rusqlite::Error),
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DbError::NotFound(msg) => write!(f, "Not found: {msg}"),
            DbError::Database(e) => write!(f, "Database error: {e}"),
        }
    }
}

impl serde::Serialize for DbError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError::Database(e)
    }
}

pub fn init_db(conn: &Connection) -> Result<(), DbError> {
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS goals (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            created_at  TEXT NOT NULL,
            target_date TEXT,
            status      TEXT NOT NULL DEFAULT 'active'
        );",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS categories (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            icon TEXT NOT NULL DEFAULT 'target'
        );",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS todos (
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
        );",
    )?;
    conn.execute_batch("ALTER TABLE todos ADD COLUMN goal_id INTEGER DEFAULT NULL")
        .ok();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS model_configs (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            provider   TEXT NOT NULL,
            api_base   TEXT NOT NULL,
            api_key    TEXT NOT NULL,
            model_name TEXT NOT NULL,
            is_active  INTEGER NOT NULL DEFAULT 0
        );",
    )?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS suggestions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            suggestion_type TEXT NOT NULL,
            todo_id         INTEGER,
            payload         TEXT NOT NULL,
            batch_id        TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'pending',
            created_at      TEXT NOT NULL
        );",
    )?;
    Ok(())
}

fn row_to_todo(row: &rusqlite::Row) -> SqlResult<Todo> {
    Ok(Todo {
        id: row.get(0)?,
        title: row.get(1)?,
        priority: row.get(2)?,
        tags: row.get(3)?,
        category_id: row.get(4)?,
        goal_id: row.get(5)?,
        created_at: row.get(6)?,
        due_at: row.get(7)?,
        completed_at: row.get(8)?,
    })
}

fn row_to_category(row: &rusqlite::Row) -> SqlResult<Category> {
    Ok(Category {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
    })
}

pub fn create_todo(conn: &Connection, input: &CreateTodo) -> Result<Todo, DbError> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO todos (title, priority, tags, category_id, goal_id, created_at, due_at) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![input.title, input.priority.as_deref().unwrap_or("medium"), input.tags.as_deref().unwrap_or(""), input.category_id, input.goal_id, now, input.due_at],
    )?;
    list_todo_by_id(conn, conn.last_insert_rowid())
}

pub fn list_todos(conn: &Connection) -> Result<Vec<Todo>, DbError> {
    let mut stmt = conn.prepare("SELECT id,title,priority,tags,category_id,goal_id,created_at,due_at,completed_at FROM todos ORDER BY id")?;
    let rows = stmt.query_map([], row_to_todo)?;
    let mut r = Vec::new();
    for row in rows {
        r.push(row?);
    }
    Ok(r)
}

fn list_todo_by_id(conn: &Connection, id: i64) -> Result<Todo, DbError> {
    let mut stmt = conn.prepare("SELECT id,title,priority,tags,category_id,goal_id,created_at,due_at,completed_at FROM todos WHERE id=?1")?;
    let mut rows = stmt.query_map(params![id], row_to_todo)?;
    rows.next()
        .transpose()?
        .ok_or(DbError::NotFound(format!("todo id={id}")))
}

pub fn update_todo(conn: &Connection, id: i64, input: &UpdateTodo) -> Result<Todo, DbError> {
    let existing = list_todo_by_id(conn, id)?;
    let title = input.title.as_ref().unwrap_or(&existing.title);
    let priority = input.priority.as_ref().unwrap_or(&existing.priority);
    let tags = input.tags.as_ref().unwrap_or(&existing.tags);
    let category_id = input.category_id.or(existing.category_id);
    let goal_id = input.goal_id.or(existing.goal_id);
    let due_at = match &input.due_at {
        Some(d) if d.is_empty() => None,
        Some(d) => Some(d.as_str()),
        None => existing.due_at.as_deref(),
    };
    conn.execute(
        "UPDATE todos SET title=?1,priority=?2,tags=?3,category_id=?4,goal_id=?5,due_at=?6 WHERE id=?7",
        params![title, priority, tags, category_id, goal_id, due_at, id],
    )?;
    list_todo_by_id(conn, id)
}

pub fn complete_todo(conn: &Connection, id: i64) -> Result<Todo, DbError> {
    let existing = list_todo_by_id(conn, id)?;
    let now = now_iso();
    if existing.completed_at.is_some() {
        conn.execute(
            "UPDATE todos SET completed_at=NULL WHERE id=?1",
            params![id],
        )?;
    } else {
        conn.execute(
            "UPDATE todos SET completed_at=?1 WHERE id=?2",
            params![now, id],
        )?;
    }
    list_todo_by_id(conn, id)
}

pub fn delete_todo(conn: &Connection, id: i64) -> Result<(), DbError> {
    let n = conn.execute("DELETE FROM todos WHERE id=?1", params![id])?;
    if n == 0 {
        return Err(DbError::NotFound(format!("todo id={id}")));
    }
    Ok(())
}

pub fn create_category(conn: &Connection, input: &CreateCategory) -> Result<Category, DbError> {
    conn.execute(
        "INSERT INTO categories (name,icon) VALUES (?1,?2)",
        params![input.name, input.icon],
    )?;
    list_category_by_id(conn, conn.last_insert_rowid())
}

pub fn list_categories(conn: &Connection) -> Result<Vec<Category>, DbError> {
    let mut stmt = conn.prepare("SELECT id,name,icon FROM categories ORDER BY id")?;
    let rows = stmt.query_map([], row_to_category)?;
    let mut r = Vec::new();
    for row in rows {
        r.push(row?);
    }
    Ok(r)
}

fn list_category_by_id(conn: &Connection, id: i64) -> Result<Category, DbError> {
    let mut stmt = conn.prepare("SELECT id,name,icon FROM categories WHERE id=?1")?;
    let mut rows = stmt.query_map(params![id], row_to_category)?;
    rows.next()
        .transpose()?
        .ok_or(DbError::NotFound(format!("category id={id}")))
}

pub fn update_category(
    conn: &Connection,
    id: i64,
    input: &UpdateCategory,
) -> Result<Category, DbError> {
    let existing = list_category_by_id(conn, id)?;
    let name = input.name.as_ref().unwrap_or(&existing.name);
    let icon = input.icon.as_ref().unwrap_or(&existing.icon);
    conn.execute(
        "UPDATE categories SET name=?1,icon=?2 WHERE id=?3",
        params![name, icon, id],
    )?;
    list_category_by_id(conn, id)
}

pub fn delete_category(conn: &Connection, id: i64) -> Result<(), DbError> {
    conn.execute(
        "UPDATE todos SET category_id=NULL WHERE category_id=?1",
        params![id],
    )?;
    let n = conn.execute("DELETE FROM categories WHERE id=?1", params![id])?;
    if n == 0 {
        return Err(DbError::NotFound(format!("category id={id}")));
    }
    Ok(())
}

fn row_to_goal(row: &rusqlite::Row) -> SqlResult<Goal> {
    Ok(Goal {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        created_at: row.get(3)?,
        target_date: row.get(4)?,
        status: row.get(5)?,
    })
}

pub fn create_goal(conn: &Connection, input: &CreateGoal) -> Result<Goal, DbError> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO goals (title, description, created_at, target_date) VALUES (?1,?2,?3,?4)",
        params![
            input.title,
            input.description.as_deref().unwrap_or(""),
            now,
            input.target_date
        ],
    )?;
    list_goal_by_id(conn, conn.last_insert_rowid())
}

pub fn list_goals(conn: &Connection) -> Result<Vec<Goal>, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id,title,description,created_at,target_date,status FROM goals ORDER BY id",
    )?;
    let rows = stmt.query_map([], row_to_goal)?;
    let mut r = Vec::new();
    for row in rows {
        r.push(row?);
    }
    Ok(r)
}

fn list_goal_by_id(conn: &Connection, id: i64) -> Result<Goal, DbError> {
    let mut stmt = conn.prepare(
        "SELECT id,title,description,created_at,target_date,status FROM goals WHERE id=?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_goal)?;
    rows.next()
        .transpose()?
        .ok_or(DbError::NotFound(format!("goal id={id}")))
}

pub fn update_goal(conn: &Connection, id: i64, input: &UpdateGoal) -> Result<Goal, DbError> {
    let existing = list_goal_by_id(conn, id)?;
    let title = input.title.as_ref().unwrap_or(&existing.title);
    let description = input.description.as_ref().unwrap_or(&existing.description);
    let target_date = match &input.target_date {
        Some(d) if d.is_empty() => None,
        Some(d) => Some(d.as_str()),
        None => existing.target_date.as_deref(),
    };
    conn.execute(
        "UPDATE goals SET title=?1,description=?2,target_date=?3 WHERE id=?4",
        params![title, description, target_date, id],
    )?;
    list_goal_by_id(conn, id)
}

pub fn complete_goal(conn: &Connection, id: i64) -> Result<Goal, DbError> {
    let existing = list_goal_by_id(conn, id)?;
    let now = now_iso();
    if existing.status == "completed" {
        conn.execute("UPDATE goals SET status='active' WHERE id=?1", params![id])?;
        conn.execute(
            "UPDATE todos SET completed_at=NULL WHERE goal_id=?1 AND completed_at IS NOT NULL",
            params![id],
        )?;
    } else {
        conn.execute(
            "UPDATE goals SET status='completed' WHERE id=?1",
            params![id],
        )?;
        conn.execute(
            "UPDATE todos SET completed_at=?1 WHERE goal_id=?2 AND completed_at IS NULL",
            params![now, id],
        )?;
    }
    list_goal_by_id(conn, id)
}

pub fn delete_goal(conn: &Connection, id: i64) -> Result<(), DbError> {
    conn.execute(
        "UPDATE todos SET goal_id=NULL WHERE goal_id=?1",
        params![id],
    )?;
    let n = conn.execute("DELETE FROM goals WHERE id=?1", params![id])?;
    if n == 0 {
        return Err(DbError::NotFound(format!("goal id={id}")));
    }
    Ok(())
}

fn row_to_model(row: &rusqlite::Row) -> SqlResult<ModelConfig> {
    Ok(ModelConfig {
        id: row.get(0)?,
        name: row.get(1)?,
        provider: row.get(2)?,
        api_base: row.get(3)?,
        api_key: row.get(4)?,
        model_name: row.get(5)?,
        is_active: row.get::<_, i64>(6)? != 0,
    })
}

pub fn create_model_config(
    conn: &Connection,
    input: &CreateModelConfig,
) -> Result<ModelConfig, DbError> {
    conn.execute(
        "INSERT INTO model_configs (name,provider,api_base,api_key,model_name,is_active) VALUES (?1,?2,?3,?4,?5,0)",
        params![input.name, input.provider, input.api_base, input.api_key, input.model_name],
    )?;
    list_model_by_id(conn, conn.last_insert_rowid())
}

pub fn list_model_configs(conn: &Connection) -> Result<Vec<ModelConfig>, DbError> {
    let mut stmt = conn.prepare("SELECT id,name,provider,api_base,api_key,model_name,is_active FROM model_configs ORDER BY id")?;
    let rows = stmt.query_map([], row_to_model)?;
    let mut r = Vec::new();
    for row in rows {
        r.push(row?);
    }
    Ok(r)
}

fn list_model_by_id(conn: &Connection, id: i64) -> Result<ModelConfig, DbError> {
    let mut stmt = conn.prepare("SELECT id,name,provider,api_base,api_key,model_name,is_active FROM model_configs WHERE id=?1")?;
    let mut rows = stmt.query_map(params![id], row_to_model)?;
    rows.next()
        .transpose()?
        .ok_or(DbError::NotFound(format!("model id={id}")))
}

pub fn update_model_config(
    conn: &Connection,
    id: i64,
    input: &UpdateModelConfig,
) -> Result<ModelConfig, DbError> {
    let existing = list_model_by_id(conn, id)?;
    let name = input.name.as_ref().unwrap_or(&existing.name);
    let provider = input.provider.as_ref().unwrap_or(&existing.provider);
    let api_base = input.api_base.as_ref().unwrap_or(&existing.api_base);
    let api_key = input.api_key.as_ref().unwrap_or(&existing.api_key);
    let model_name = input.model_name.as_ref().unwrap_or(&existing.model_name);
    let is_active = match input.is_active {
        Some(true) => {
            conn.execute("UPDATE model_configs SET is_active=0", [])?;
            true
        }
        Some(false) => false,
        None => existing.is_active,
    };
    conn.execute(
        "UPDATE model_configs SET name=?1,provider=?2,api_base=?3,api_key=?4,model_name=?5,is_active=?6 WHERE id=?7",
        params![name, provider, api_base, api_key, model_name, is_active as i64, id],
    )?;
    list_model_by_id(conn, id)
}

pub fn delete_model_config(conn: &Connection, id: i64) -> Result<(), DbError> {
    let n = conn.execute("DELETE FROM model_configs WHERE id=?1", params![id])?;
    if n == 0 {
        return Err(DbError::NotFound(format!("model id={id}")));
    }
    Ok(())
}

pub fn save_suggestion(conn: &Connection, batch_id: &str, s: &Suggestion) -> Result<i64, DbError> {
    let now = now_iso();
    let stype = &s.suggestion_type;
    let tid = s.todo_id;
    let payload = serde_json::to_string(s).unwrap_or_default();
    conn.execute(
        "INSERT INTO suggestions (suggestion_type, todo_id, payload, batch_id, status, created_at) VALUES (?1,?2,?3,?4,'pending',?5)",
        params![stype, tid, payload, batch_id, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn list_pending_suggestions(conn: &Connection) -> Result<Vec<(i64, Suggestion)>, DbError> {
    let mut stmt =
        conn.prepare("SELECT id, payload FROM suggestions WHERE status='pending' ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        let id: i64 = r.get(0)?;
        let payload: String = r.get(1)?;
        Ok((id, payload))
    })?;
    let mut r = Vec::new();
    for row in rows {
        let (id, payload) = row?;
        if let Ok(s) = serde_json::from_str::<Suggestion>(&payload) {
            r.push((id, s));
        }
    }
    Ok(r)
}

pub fn pending_suggestions_count(conn: &Connection) -> Result<i64, DbError> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM suggestions WHERE status='pending'",
        [],
        |r| r.get(0),
    )?)
}

pub fn accept_suggestion_in_db(conn: &Connection, id: i64) -> Result<(), DbError> {
    conn.execute(
        "UPDATE suggestions SET status='accepted' WHERE id=?1",
        params![id],
    )?;
    Ok(())
}

pub fn reject_suggestion_in_db(conn: &Connection, id: i64) -> Result<(), DbError> {
    conn.execute(
        "UPDATE suggestions SET status='rejected' WHERE id=?1",
        params![id],
    )?;
    Ok(())
}

pub fn clear_stale_suggestions(conn: &Connection) -> Result<(), DbError> {
    conn.execute("DELETE FROM suggestions WHERE status='rejected'", [])?;
    Ok(())
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let (y, mo, d) = civil_from_days(secs as i64 / 86400);
    let t = secs % 86400;
    let h = t / 3600;
    let m = (t % 3600) / 60;
    let s = t % 60;
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}")
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    fn conn() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init_db(&c).unwrap();
        c
    }
    #[test]
    fn test_todo_crud() {
        let c = conn();
        let t = create_todo(
            &c,
            &CreateTodo {
                title: "a".into(),
                priority: None,
                tags: None,
                category_id: None,
                goal_id: None,
                due_at: None,
            },
        )
        .unwrap();
        assert_eq!(t.title, "a");
        assert_eq!(list_todos(&c).unwrap().len(), 1);
        let u = update_todo(
            &c,
            t.id,
            &UpdateTodo {
                title: Some("b".into()),
                priority: None,
                tags: None,
                category_id: None,
                goal_id: None,
                due_at: None,
            },
        )
        .unwrap();
        assert_eq!(u.title, "b");
        let d = complete_todo(&c, t.id).unwrap();
        assert!(d.completed_at.is_some());
        let ud = complete_todo(&c, t.id).unwrap();
        assert!(ud.completed_at.is_none());
        delete_todo(&c, t.id).unwrap();
        assert!(list_todos(&c).unwrap().is_empty());
    }
    #[test]
    fn test_category_crud() {
        let c = conn();
        let cat = create_category(
            &c,
            &CreateCategory {
                name: "x".into(),
                icon: "star".into(),
            },
        )
        .unwrap();
        assert_eq!(cat.name, "x");
        let u = update_category(
            &c,
            cat.id,
            &UpdateCategory {
                name: Some("y".into()),
                icon: None,
            },
        )
        .unwrap();
        assert_eq!(u.name, "y");
        delete_category(&c, cat.id).unwrap();
        assert!(list_categories(&c).unwrap().is_empty());
    }
    #[test]
    fn test_delete_category_clears_todo_refs() {
        let c = conn();
        let cat = create_category(
            &c,
            &CreateCategory {
                name: "z".into(),
                icon: "target".into(),
            },
        )
        .unwrap();
        let t = create_todo(
            &c,
            &CreateTodo {
                title: "t".into(),
                priority: None,
                tags: None,
                category_id: Some(cat.id),
                goal_id: None,
                due_at: None,
            },
        )
        .unwrap();
        delete_category(&c, cat.id).unwrap();
        assert_eq!(list_todo_by_id(&c, t.id).unwrap().category_id, None);
    }
    #[test]
    fn test_goal_crud() {
        let c = conn();
        let g = create_goal(
            &c,
            &CreateGoal {
                title: "六级".into(),
                description: Some("550分".into()),
                target_date: None,
            },
        )
        .unwrap();
        assert_eq!(g.title, "六级");
        assert_eq!(list_goals(&c).unwrap().len(), 1);
        let u = update_goal(
            &c,
            g.id,
            &UpdateGoal {
                title: Some("四级".into()),
                description: None,
                target_date: None,
            },
        )
        .unwrap();
        assert_eq!(u.title, "四级");
        delete_goal(&c, g.id).unwrap();
        assert!(list_goals(&c).unwrap().is_empty());
    }
    #[test]
    fn test_complete_goal_archives_todos() {
        let c = conn();
        let g = create_goal(
            &c,
            &CreateGoal {
                title: "目标".into(),
                description: None,
                target_date: None,
            },
        )
        .unwrap();
        let t = create_todo(
            &c,
            &CreateTodo {
                title: "任务".into(),
                priority: None,
                tags: None,
                category_id: None,
                goal_id: Some(g.id),
                due_at: None,
            },
        )
        .unwrap();
        assert!(t.completed_at.is_none());
        complete_goal(&c, g.id).unwrap();
        let updated = list_todo_by_id(&c, t.id).unwrap();
        assert!(updated.completed_at.is_some());
    }
    #[test]
    fn test_model_crud() {
        let c = conn();
        let m = create_model_config(
            &c,
            &CreateModelConfig {
                name: "D".into(),
                provider: "ds".into(),
                api_base: "x".into(),
                api_key: "k".into(),
                model_name: "v3".into(),
            },
        )
        .unwrap();
        assert_eq!(m.name, "D");
        assert!(!m.is_active);
        let u = update_model_config(
            &c,
            m.id,
            &UpdateModelConfig {
                name: Some("E".into()),
                provider: None,
                api_base: None,
                api_key: None,
                model_name: None,
                is_active: Some(true),
            },
        )
        .unwrap();
        assert_eq!(u.name, "E");
        assert!(u.is_active);
        delete_model_config(&c, m.id).unwrap();
        assert!(list_model_configs(&c).unwrap().is_empty());
    }
}
