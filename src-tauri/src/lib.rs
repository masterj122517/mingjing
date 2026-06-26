mod commands;
mod db;
mod llm;
mod models;
mod passkey;
mod rules;

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("app data dir");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("mingjing.db");
            let conn = Mutex::new(Connection::open(&db_path).expect("open db"));
            db::init_db(&conn.lock().unwrap()).expect("init db");
            app.manage(conn);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_todo,
            commands::list_todos,
            commands::update_todo,
            commands::complete_todo,
            commands::delete_todo,
            commands::create_category,
            commands::list_categories,
            commands::update_category,
            commands::delete_category,
            commands::create_goal,
            commands::list_goals,
            commands::update_goal,
            commands::complete_goal,
            commands::delete_goal,
            commands::create_model_config,
            commands::list_model_configs,
            commands::update_model_config,
            commands::delete_model_config,
            commands::set_master_password,
            commands::has_master_password,
            commands::verify_master_password,
            commands::analyze_todos,
            commands::suggest_plan,
            commands::save_suggestions,
            commands::list_pending_suggestions,
            commands::pending_suggestions_count,
            commands::accept_suggestion,
            commands::reject_suggestion,
            commands::migrate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
