use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: i64,
    pub title: String,
    pub priority: String,
    pub tags: String,
    pub category_id: Option<i64>,
    pub goal_id: Option<i64>,
    pub created_at: String,
    pub due_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTodo {
    pub title: String,
    pub priority: Option<String>,
    pub tags: Option<String>,
    pub category_id: Option<i64>,
    pub goal_id: Option<i64>,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTodo {
    pub title: Option<String>,
    pub priority: Option<String>,
    pub tags: Option<String>,
    pub category_id: Option<i64>,
    pub goal_id: Option<i64>,
    pub due_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCategory {
    pub name: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCategory {
    pub name: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goal {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub created_at: String,
    pub target_date: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGoal {
    pub title: String,
    pub description: Option<String>,
    pub target_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateGoal {
    pub title: Option<String>,
    pub description: Option<String>,
    pub target_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: i64,
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub model_name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateModelConfig {
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub api_key: String,
    pub model_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateModelConfig {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub api_base: Option<String>,
    pub api_key: Option<String>,
    pub model_name: Option<String>,
    pub is_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisOutput {
    pub analysis: Analysis,
    pub suggestions: Vec<Suggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Analysis {
    pub risk_alerts: Vec<RiskAlert>,
    pub progress_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskAlert {
    pub todo_id: Option<i64>,
    pub risk: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Suggestion {
    #[serde(rename = "type")]
    pub suggestion_type: String,
    pub task: Option<SuggestionTask>,
    pub todo_id: Option<i64>,
    pub changes: Option<SuggestionChanges>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestionTask {
    pub title: String,
    pub priority: String,
    pub due_date: Option<String>,
    pub tags: Option<String>,
    pub goal_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestionChanges {
    pub title: Option<String>,
    pub due_date: Option<String>,
}
