use crate::db;
use crate::models::*;
use rusqlite::Connection;
use serde::Deserialize;
use std::sync::Mutex;
use tauri::{Manager, State};

#[tauri::command]
pub fn create_todo(conn: State<Mutex<Connection>>, input: CreateTodo) -> Result<Todo, String> {
    db::create_todo(&conn.lock().unwrap(), &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_todos(conn: State<Mutex<Connection>>) -> Result<Vec<Todo>, String> {
    db::list_todos(&conn.lock().unwrap()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn update_todo(
    conn: State<Mutex<Connection>>,
    id: i64,
    input: UpdateTodo,
) -> Result<Todo, String> {
    db::update_todo(&conn.lock().unwrap(), id, &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn complete_todo(conn: State<Mutex<Connection>>, id: i64) -> Result<Todo, String> {
    db::complete_todo(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_todo(conn: State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    db::delete_todo(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn create_category(
    conn: State<Mutex<Connection>>,
    input: CreateCategory,
) -> Result<Category, String> {
    db::create_category(&conn.lock().unwrap(), &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_categories(conn: State<Mutex<Connection>>) -> Result<Vec<Category>, String> {
    db::list_categories(&conn.lock().unwrap()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn update_category(
    conn: State<Mutex<Connection>>,
    id: i64,
    input: UpdateCategory,
) -> Result<Category, String> {
    db::update_category(&conn.lock().unwrap(), id, &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_category(conn: State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    db::delete_category(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_goal(conn: State<Mutex<Connection>>, input: CreateGoal) -> Result<Goal, String> {
    db::create_goal(&conn.lock().unwrap(), &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_goals(conn: State<Mutex<Connection>>) -> Result<Vec<Goal>, String> {
    db::list_goals(&conn.lock().unwrap()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn update_goal(
    conn: State<Mutex<Connection>>,
    id: i64,
    input: UpdateGoal,
) -> Result<Goal, String> {
    db::update_goal(&conn.lock().unwrap(), id, &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn complete_goal(conn: State<Mutex<Connection>>, id: i64) -> Result<Goal, String> {
    db::complete_goal(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_goal(conn: State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    db::delete_goal(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_model_config(
    conn: State<Mutex<Connection>>,
    input: CreateModelConfig,
) -> Result<ModelConfig, String> {
    db::create_model_config(&conn.lock().unwrap(), &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn list_model_configs(conn: State<Mutex<Connection>>) -> Result<Vec<ModelConfig>, String> {
    db::list_model_configs(&conn.lock().unwrap()).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn update_model_config(
    conn: State<Mutex<Connection>>,
    id: i64,
    input: UpdateModelConfig,
) -> Result<ModelConfig, String> {
    db::update_model_config(&conn.lock().unwrap(), id, &input).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn delete_model_config(conn: State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    db::delete_model_config(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct SetPasswordPayload {
    pub password: String,
}
#[tauri::command]
pub fn set_master_password(
    app: tauri::AppHandle,
    payload: SetPasswordPayload,
) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::passkey::set_master_password(&app_dir, &payload.password).map(|_| true)
}
#[tauri::command]
pub fn has_master_password(app: tauri::AppHandle) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(crate::passkey::has_master_password(&app_dir))
}
#[tauri::command]
pub fn verify_master_password(
    app: tauri::AppHandle,
    payload: SetPasswordPayload,
) -> Result<bool, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    crate::passkey::verify_master_password(&app_dir, &payload.password)
}

#[tauri::command]
pub async fn analyze_todos(
    conn: State<'_, Mutex<Connection>>,
    app: tauri::AppHandle,
) -> Result<AnalysisOutput, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (todos, goals, models) = {
        let c = conn.lock().unwrap();
        (
            crate::db::list_todos(&c).map_err(|e| e.to_string())?,
            crate::db::list_goals(&c).map_err(|e| e.to_string())?,
            crate::db::list_model_configs(&c).map_err(|e| e.to_string())?,
        )
    };

    // Try active model with LLM, fallback to rules
    if let Some(active) = models.iter().find(|m| m.is_active) {
        let api_key = if crate::passkey::has_master_password(&app_dir) {
            return Err("请先验证主密码".into());
        } else {
            active.api_key.clone()
        };

        match crate::llm::call_llm_analyze(&active.api_base, &api_key, &active.model_name, &todos, &goals).await {
            Ok(r) => return Ok(r),
            Err(e) => {
                let mut r = crate::rules::offline_analysis(&todos, &goals);
                r.analysis.progress_summary = format!("（LLM 调用失败: {}）\n{}", e, r.analysis.progress_summary);
                return Ok(r);
            }
        }
    }

    Ok(crate::rules::offline_analysis(&todos, &goals))
}

#[tauri::command]
pub async fn suggest_plan(
    conn: State<'_, Mutex<Connection>>,
    app: tauri::AppHandle,
    instruction: String,
) -> Result<AnalysisOutput, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (todos, goals, models) = {
        let c = conn.lock().unwrap();
        (
            crate::db::list_todos(&c).map_err(|e| e.to_string())?,
            crate::db::list_goals(&c).map_err(|e| e.to_string())?,
            crate::db::list_model_configs(&c).map_err(|e| e.to_string())?,
        )
    };

    let active = models.iter().find(|m| m.is_active).ok_or("请先配置并选择一个模型")?;

    if crate::passkey::has_master_password(&app_dir) {
        return Err("请先验证主密码".into());
    }

    crate::llm::call_llm_plan(&active.api_base, &active.api_key, &active.model_name, &todos, &goals, &instruction).await
}

#[tauri::command]
pub async fn generate_plan(
    conn: State<'_, Mutex<Connection>>,
    app: tauri::AppHandle,
    goal_id: i64,
    instruction: String,
) -> Result<AnalysisOutput, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (models, goal) = {
        let c = conn.lock().unwrap();
        let models = crate::db::list_model_configs(&c).map_err(|e| e.to_string())?;
        let goal =
            crate::db::list_goal_by_id(&c, goal_id).map_err(|e| e.to_string())?;
        (models, goal)
    };

    let active = models.iter().find(|m| m.is_active).ok_or("请先配置并选择一个模型")?;
    if crate::passkey::has_master_password(&app_dir) { return Err("请先验证主密码".into()); }

    let mut result = crate::llm::call_llm_generate_plan(
        &active.api_base, &active.api_key, &active.model_name, &goal, &instruction,
    ).await;

    // stamp goal_id on all create suggestions
    if let Ok(ref mut r) = result {
        for s in &mut r.suggestions {
            if s.suggestion_type == "create" {
                if let Some(ref mut t) = s.task { t.goal_id = Some(goal_id); }
            }
        }
    }
    result
}

#[tauri::command]
pub fn save_suggestions(conn: State<Mutex<Connection>>, batch_id: String, suggestions: Vec<Suggestion>) -> Result<i64, String> {
    let c = conn.lock().unwrap();
    let mut count: i64 = 0;
    for s in &suggestions {
        crate::db::save_suggestion(&c, &batch_id, s).map_err(|e| e.to_string())?;
        count += 1;
    }
    Ok(count)
}

#[tauri::command]
pub fn list_pending_suggestions(conn: State<Mutex<Connection>>) -> Result<Vec<(i64, Suggestion)>, String> {
    crate::db::list_pending_suggestions(&conn.lock().unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pending_suggestions_count(conn: State<Mutex<Connection>>) -> Result<i64, String> {
    crate::db::pending_suggestions_count(&conn.lock().unwrap()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn accept_suggestion(conn: State<Mutex<Connection>>, id: i64, dbsuggestion: Suggestion) -> Result<(), String> {
    let c = conn.lock().unwrap();
    crate::db::accept_suggestion_in_db(&c, id).map_err(|e| e.to_string())?;
    if dbsuggestion.suggestion_type == "create" {
        if let Some(t) = &dbsuggestion.task {
            crate::db::create_todo(&c, &CreateTodo {
                title: t.title.clone(), priority: Some(t.priority.clone()),
                tags: Some(t.tags.clone().unwrap_or_default()),
                category_id: None, goal_id: t.goal_id, due_at: t.due_date.clone(),
            }).map_err(|e| e.to_string())?;
        }
    } else if let Some(tid) = dbsuggestion.todo_id {
        let input = UpdateTodo {
            title: dbsuggestion.changes.as_ref().and_then(|c| c.title.clone()),
            priority: None, tags: None, category_id: None, goal_id: None,
            due_at: dbsuggestion.changes.as_ref().and_then(|c| c.due_date.clone()).or(Some(String::new())),
        };
        crate::db::update_todo(&c, tid, &input).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn reject_suggestion(conn: State<Mutex<Connection>>, id: i64) -> Result<(), String> {
    crate::db::reject_suggestion_in_db(&conn.lock().unwrap(), id).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct MigratePayload {
    pub todos: Vec<MigrateTodo>,
    pub categories: Vec<CreateCategory>,
}
#[derive(Debug, Deserialize)]
pub struct MigrateTodo {
    pub title: String,
    pub priority: String,
    pub tags: String,
    pub category_id: Option<i64>,
    pub due_at: Option<String>,
    pub completed_at: Option<String>,
}
#[derive(Debug, serde::Serialize)]
pub struct MigrateResult {
    pub categories: usize,
    pub todos: usize,
}

#[tauri::command]
pub fn migrate(
    conn: State<Mutex<Connection>>,
    payload: MigratePayload,
) -> Result<MigrateResult, String> {
    let conn = conn.lock().unwrap();
    let mut c = 0;
    let mut t = 0;
    for cat in &payload.categories {
        db::create_category(&conn, cat).map_err(|e| e.to_string())?;
        c += 1;
    }
    for todo in &payload.todos {
        let input = CreateTodo {
            title: todo.title.clone(),
            priority: Some(todo.priority.clone()),
            tags: Some(todo.tags.clone()),
            category_id: todo.category_id,
            goal_id: None,
            due_at: todo.due_at.clone(),
        };
        let created = db::create_todo(&conn, &input).map_err(|e| e.to_string())?;
        if todo.completed_at.is_some() {
            db::complete_todo(&conn, created.id).map_err(|e| e.to_string())?;
        }
        t += 1;
    }
    Ok(MigrateResult {
        categories: c,
        todos: t,
    })
}
