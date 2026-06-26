use crate::models::*;
use serde_json::json;

const SYSTEM_PROMPT: &str = r#"你是「明镜」学习计划管理系统的 AI 助手。

## 规则
1. 你可以建议创建新任务，包括标题、优先级、截止日期、标签、所属目标。
2. 你可以建议修改已有任务的截止日期或标题。
3. 默认不要修改已有任务的优先级。只有用户明确要求时才可以。
4. 排期建议应考虑用户的现有负载，避免过度拥挤。
5. 每个建议必须附带理由字段（reason）。

## 输出格式
必须只返回以下 JSON，不要包含其他文字：
{
  "analysis": {
    "risk_alerts": [{"todo_id": null, "risk": "high|medium|low", "reason": "..."}],
    "progress_summary": "一段中文总结"
  },
  "suggestions": []
}"#;

pub async fn call_llm_analyze(
    api_base: &str,
    api_key: &str,
    model: &str,
    todos: &[Todo],
    goals: &[Goal],
) -> Result<AnalysisOutput, String> {
    let ctx = build_context(todos, goals);
    let user_msg = format!(
        "请分析以下学习任务数据，只进行自动分析，不要生成建议（suggestions必须为空数组[]）：\n\n{}",
        serde_json::to_string_pretty(&ctx).unwrap_or_default()
    );
    call_deepseek(api_base, api_key, model, &user_msg).await
}

pub async fn call_llm_plan(
    api_base: &str,
    api_key: &str,
    model: &str,
    todos: &[Todo],
    goals: &[Goal],
    instruction: &str,
) -> Result<AnalysisOutput, String> {
    let ctx = build_context(todos, goals);
    let user_msg = format!(
        "用户指令：{}\n\n当前任务数据：\n{}",
        instruction,
        serde_json::to_string_pretty(&ctx).unwrap_or_default()
    );
    call_deepseek(api_base, api_key, model, &user_msg).await
}

fn build_context(todos: &[Todo], goals: &[Goal]) -> serde_json::Value {
    let tasks: Vec<serde_json::Value> = todos.iter().map(|t| {
        json!({
            "id": t.id, "title": t.title, "priority": t.priority,
            "tags": t.tags, "due_at": t.due_at, "completed_at": t.completed_at,
        })
    }).collect();
    let gs: Vec<serde_json::Value> = goals.iter().map(|g| {
        json!({ "id": g.id, "title": g.title, "description": g.description, "status": g.status })
    }).collect();
    json!({ "goals": gs, "tasks": tasks })
}

async fn call_deepseek(
    api_base: &str,
    api_key: &str,
    model: &str,
    user_msg: &str,
) -> Result<AnalysisOutput, String> {
    let url = format!("{}/chat/completions", api_base.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&json!({
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        }))
        .send()
        .await
        .map_err(|e| format!("网络错误: {e}"))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("响应解析错误: {e}"))?;

    if !status.is_success() {
        let err_msg = body["error"]["message"].as_str().unwrap_or("未知错误");
        return Err(format!("API 错误 ({}): {err_msg}", status.as_u16()));
    }

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("响应格式异常")?;

    serde_json::from_str::<AnalysisOutput>(content).map_err(|e| format!("JSON 解析失败: {e}"))
}
