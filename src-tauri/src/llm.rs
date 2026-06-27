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

const PLAN_PROMPT: &str = r#"你是「明镜」学习计划管理系统的 AI 导师，擅长为学习者制定结构化的学习计划。

## 任务
根据用户的学习目标、知识水平和时间安排，生成一份详细的任务拆解计划。

## 规则
1. 将目标拆解为 5-15 个具体任务，按学习逻辑排序
2. 每个任务包含：标题、优先级（high/medium/low）、建议截止日期（ISO 8601 格式如 2026-07-05T23:59:00）、标签（逗号分隔）、理由
3. 优先级应根据任务重要性合理分配（基础/前置知识=high，拓展/练习=medium/low）
4. 截止日期应合理分布在用户给出的时间范围内，避免某天过于拥挤
5. 标签应体现任务类别（如：基础、语法、实战、复习等）

## 严格的 JSON 输出格式
你必须只返回以下 JSON 结构，不要包含任何其他文字、解释或代码块标记。

risk_alerts 必须是一个对象数组，每个对象包含 todo_id(null), risk("high|medium|low"), reason("string")。
如果没有任何风险，risk_alerts 必须为空数组 []。

进度总结 progress_summary 必须是字符串，如果不需要可以为空字符串 ""。

输出必须是可直接 JSON.parse 的有效 JSON：
{"analysis":{"risk_alerts":[],"progress_summary":""},"suggestions":[{"type":"create","task":{"title":"任务标题","priority":"high","due_date":"2026-07-05T23:59:00","tags":"标签1,标签2","goal_id":null},"reason":"这是你学习的第一个概念，理解它非常重要"}]}"#;

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
    call_api(api_base, api_key, model, user_msg, SYSTEM_PROMPT).await
}

pub async fn call_llm_generate_plan(
    api_base: &str,
    api_key: &str,
    model: &str,
    goal: &Goal,
    instruction: &str,
) -> Result<AnalysisOutput, String> {
    let user_msg = format!(
        "目标：{}\n目标描述：{}\n期望完成日期：{}\n用户信息：{}\n\n请为这个学习目标生成一份拆解计划，任务应直接关联到此目标。",
        goal.title,
        goal.description,
        goal.target_date.as_deref().unwrap_or("未指定"),
        instruction
    );
    call_api(api_base, api_key, model, &user_msg, PLAN_PROMPT).await
}

async fn call_api(
    api_base: &str,
    api_key: &str,
    model: &str,
    user_msg: &str,
    system_prompt: &str,
) -> Result<AnalysisOutput, String> {
    let url = format!("{}/chat/completions", api_base.trim_end_matches('/'));
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .timeout(std::time::Duration::from_secs(60))
        .json(&json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
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

    parse_llm_response(content)
}

fn parse_llm_response(raw: &str) -> Result<AnalysisOutput, String> {
    let cleaned = raw.trim();
    let json_str = if cleaned.starts_with("```") {
        cleaned
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        cleaned
    };

    // First attempt: direct parse
    if let Ok(r) = serde_json::from_str::<AnalysisOutput>(json_str) {
        return Ok(r);
    }

    // Second attempt: sanitize common LLM mistakes
    let fixed = sanitize_json(json_str);
    serde_json::from_str::<AnalysisOutput>(&fixed).map_err(|e| {
        let preview: String = fixed.chars().take(300).collect();
        format!("JSON 解析失败: {e}\n\n修复后的响应前300字符: {preview}")
    })
}

fn sanitize_json(raw: &str) -> String {
    let mut val: serde_json::Value = match serde_json::from_str(raw) {
        Ok(v) => v,
        Err(_) => return raw.to_string(),
    };

    // Ensure analysis.risk_alerts is an array
    if let Some(obj) = val.as_object_mut() {
        if let Some(analysis) = obj.get_mut("analysis").and_then(|a| a.as_object_mut()) {
            // Fix risk_alerts: if not an array, make it empty array
            if let Some(alerts) = analysis.get_mut("risk_alerts") {
                if !alerts.is_array() {
                    *alerts = serde_json::json!([]);
                }
            } else {
                analysis.insert("risk_alerts".to_string(), serde_json::json!([]));
            }
            // Fix progress_summary: if not a string, make it empty string
            if let Some(summary) = analysis.get_mut("progress_summary") {
                if !summary.is_string() {
                    *summary = serde_json::json!("");
                }
            } else {
                analysis.insert("progress_summary".to_string(), serde_json::json!(""));
            }
        }

        // Ensure suggestions is an array
        if let Some(suggestions) = obj.get_mut("suggestions") {
            if !suggestions.is_array() {
                *suggestions = serde_json::json!([]);
            }
        }

        // Fix each suggestion: ensure required fields exist
        if let Some(arr) = obj.get_mut("suggestions").and_then(|s| s.as_array_mut()) {
            for s in arr.iter_mut() {
                if let Some(obj) = s.as_object_mut() {
                    obj.entry("todo_id").or_insert(serde_json::json!(null));
                    obj.entry("changes").or_insert(serde_json::json!(null));
                    if !obj.contains_key("reason") {
                        obj.insert("reason".to_string(), serde_json::json!("AI 建议"));
                    }
                }
            }
        }
    }

    val.to_string()
}
