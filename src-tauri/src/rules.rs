use crate::models::*;

pub fn offline_analysis(todos: &[Todo], _goals: &[Goal]) -> AnalysisOutput {
    let now = now_str();
    let mut alerts = Vec::new();

    for t in todos {
        if t.completed_at.is_some() {
            continue;
        }
        if let Some(due) = &t.due_at {
            if let (Some(d), Some(n)) = (parse_date(due), parse_date(&now)) {
                if d < n {
                    alerts.push(RiskAlert {
                        todo_id: Some(t.id),
                        risk: "high".into(),
                        reason: "已逾期".into(),
                    });
                } else if d + 86400 > n {
                    alerts.push(RiskAlert {
                        todo_id: Some(t.id),
                        risk: "medium".into(),
                        reason: "截止时间临近（24小时内）".into(),
                    });
                }
            }
        }
    }

    let active = todos.iter().filter(|t| t.completed_at.is_none()).count();
    let done = todos.len() - active;
    let summary = format!(
        "当前共 {} 项任务，已完成 {} 项，待完成 {} 项。{}",
        todos.len(),
        done,
        active,
        if alerts.is_empty() {
            "状态良好。"
        } else {
            "存在需关注的风险项。"
        }
    );

    AnalysisOutput {
        analysis: Analysis {
            risk_alerts: alerts,
            progress_summary: summary,
        },
        suggestions: vec![],
    }
}

fn now_str() -> String {
    let s = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let (y, mo, d) = civil(s as i64 / 86400);
    let t = s % 86400;
    let h = t / 3600;
    let m = (t % 3600) / 60;
    let s = t % 60;
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}")
}

fn parse_date(s: &str) -> Option<u64> {
    let p: Vec<&str> = s.split(&['-', 'T', ':']).collect();
    if p.len() < 3 {
        return None;
    }
    let y: i64 = p[0].parse().ok()?;
    let m: i64 = p[1].parse().ok()?;
    let d: i64 = p[2].parse().ok()?;
    let h: u64 = p.get(3).and_then(|x| x.parse().ok()).unwrap_or(0);
    let min: u64 = p.get(4).and_then(|x| x.parse().ok()).unwrap_or(0);
    let sec: u64 = p.get(5).and_then(|x| x.parse().ok()).unwrap_or(0);
    let days = days_since_epoch(y, m, d);
    Some(days as u64 * 86400 + h * 3600 + min * 60 + sec)
}

fn days_since_epoch(y: i64, m: i64, d: i64) -> i64 {
    let m = m;
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m <= 2 { m + 9 } else { m - 3 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719528
}

fn civil(epoch_days: i64) -> (i64, u32, u32) {
    let z = epoch_days + 719468;
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

    #[test]
    fn test_offline_analysis_empty() {
        let r = offline_analysis(&[], &[]);
        assert!(r.analysis.risk_alerts.is_empty());
        assert!(r.analysis.progress_summary.contains("0 项任务"));
    }

    #[test]
    fn test_offline_analysis_overdue() {
        let todos = vec![Todo {
            id: 1,
            title: "overdue".into(),
            priority: "high".into(),
            tags: "".into(),
            category_id: None,
            goal_id: None,
            created_at: "".into(),
            due_at: Some("2020-01-01T00:00:00".into()),
            completed_at: None,
        }];
        let r = offline_analysis(&todos, &[]);
        assert_eq!(r.analysis.risk_alerts.len(), 1);
        assert_eq!(r.analysis.risk_alerts[0].risk, "high");
    }
}
