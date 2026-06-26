import { playCompleteSound, playDeleteSound } from './sound.js';
import { ICONS, renderIcon } from './icons.js';

const { invoke } = window.__TAURI__.core;

let todos = [];
let nextId = 0;
let categories = [];
let goals = [];
let nextCategoryId = 1;
let currentView = 'all';
let recentlyDeleted = null;
let deleteTimer = null;
let currentCategoryId = null;
let editingCategoryId = null;
let currentGoalId = null;
let deleteConfirming = false;
let editingGoalId = null;
let goalDeleteConfirming = false;
let models = [];

async function loadModels() {
  try { models = await invoke('list_model_configs'); }
  catch (_) { models = []; }
}
let editingId = null;
let editingTags = [];
let editingDueDate = null;
let calendarYear = 2026;
let calendarMonth = 6;

async function loadData() {
  [categories, goals, todos] = await Promise.all([
    invoke('list_categories'),
    invoke('list_goals'),
    invoke('list_todos'),
  ]);
  nextId = Math.max(0, ...todos.map((t) => t.id)) + 1;
  nextCategoryId = Math.max(0, ...categories.map((c) => c.id)) + 1;
  updateGoalSelect();

  if (todos.length === 0 && categories.length === 0) {
    await maybeMigrate();
    [categories, goals, todos] = await Promise.all([
      invoke('list_categories'),
      invoke('list_goals'),
      invoke('list_todos'),
    ]);
    nextId = Math.max(0, ...todos.map((t) => t.id)) + 1;
    nextCategoryId = Math.max(0, ...categories.map((c) => c.id)) + 1;
    updateGoalSelect();
  }
}

function updateGoalSelect() {
  const sel = document.getElementById('input-goal');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">无目标</option>' + goals.filter((g) => g.status === 'active').map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join('');
  sel.value = cur;
}

async function maybeMigrate() {
  try {
    const oldTodos = localStorage.getItem('mingjing_todos');
    const oldCats = localStorage.getItem('mingjing_categories');
    if (!oldTodos && !oldCats) return;
    const payload = { todos: [], categories: [] };
    if (oldTodos) payload.todos = JSON.parse(oldTodos);
    if (oldCats) payload.categories = JSON.parse(oldCats).map((c) => ({ name: c.name, icon: c.icon }));
    if (payload.todos.length || payload.categories.length) await invoke('migrate', { payload });
    localStorage.removeItem('mingjing_todos');
    localStorage.removeItem('mingjing_categories');
    localStorage.removeItem('mingjing_nextCategoryId');
  } catch (_) {}
}

function isOverdue(todo) {
  if (!todo.due_at || todo.completed_at) return false;
  return new Date(todo.due_at) < new Date();
}
function isDueSoon(todo) {
  if (!todo.due_at || todo.completed_at || isOverdue(todo)) return false;
  return new Date(todo.due_at) - new Date() < 86400000;
}
function isToday(dueStr) {
  if (!dueStr) return false;
  const d = new Date(dueStr), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function formatDueDate(dueStr) {
  if (!dueStr) return '';
  const d = new Date(dueStr);
  if (isToday(dueStr)) return '今天';
  const t = new Date(); t.setDate(t.getDate() + 1);
  if (d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()) return '明天';
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${w[d.getDay()]}`;
}
function priorityLabel(p) { return { high: '高', medium: '中', low: '低' }[p] || p; }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

function filteredTodos() {
  const now = new Date();
  let result;
  switch (currentView) {
    case 'today':
      result = todos.filter((t) => !t.completed_at && t.due_at && isToday(t.due_at));
      break;
    case 'upcoming':
      result = todos.filter((t) => !t.completed_at && t.due_at && new Date(t.due_at) > now);
      break;
    case 'completed':
      result = todos.filter((t) => t.completed_at);
      break;
    default:
      result = todos.filter((t) => !t.completed_at);
  }
  if (currentView === 'category' && currentCategoryId !== null) {
    result = result.filter((t) => t.category_id === currentCategoryId);
  }
  if (currentView === 'goal' && currentGoalId !== null) {
    result = result.filter((t) => t.goal_id === currentGoalId);
  }
  return result.sort((a, b) => {
    if (currentView === 'completed') return new Date(b.completed_at) - new Date(a.completed_at);
    const pa = PRIORITY_ORDER[a.priority] ?? 3, pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at) - new Date(b.due_at);
  });
}

function updateNavCounts() {
  const a = todos.filter((t) => !t.completed_at);
  document.getElementById('count-all').textContent = a.length;
  document.getElementById('count-today').textContent = a.filter((t) => t.due_at && isToday(t.due_at)).length;
  document.getElementById('count-upcoming').textContent = a.filter((t) => t.due_at && new Date(t.due_at) > new Date()).length;
  document.getElementById('count-completed').textContent = todos.filter((t) => t.completed_at).length;
  document.getElementById('btn-analyze').disabled = a.length === 0;
}
function updateViewTitle() {
  if (currentView === 'category') {
    const c = getCategoryById(currentCategoryId);
    document.getElementById('view-title').textContent = c ? c.name : '分类';
  } else if (currentView === 'goal') {
    const g = goals.find((x) => x.id === currentGoalId);
    document.getElementById('view-title').textContent = g ? g.title : '目标';
  } else {
    const t = { all: '全部任务', today: '今天', upcoming: '计划中', completed: '已完成' };
    document.getElementById('view-title').textContent = t[currentView] || '全部任务';
  }
}

function buildTaskHTML(t) {
  return `
    <li class="task-item${t.completed_at ? ' completed' : ''}" data-id="${t.id}">
      <div class="task-checkbox" data-action="toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="task-body">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="priority-badge priority-${t.priority}">${priorityLabel(t.priority)}</span>
          ${t.category_id ? (() => { const c = getCategoryById(t.category_id); return c ? `<span class="task-category">${renderIcon(c.icon, 12)} ${escapeHtml(c.name)}</span>` : ''; })() : ''}
          ${t.due_at ? `<span class="task-due${isOverdue(t) ? ' overdue' : ''}${isDueSoon(t) ? ' soon' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${formatDueDate(t.due_at)}
          </span>` : ''}
          <span class="task-tags">${(t.tags || '').split(',').filter((x) => x.trim()).map((x) => `<span class="tag-pill">${escapeHtml(x.trim())}</span>`).join('')}</span>
        </div>
      </div>
      <button class="task-delete" data-action="delete" title="删除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
    </li>`;
}

function renderTaskList() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const f = filteredTodos();
  if (f.length === 0) { list.innerHTML = ''; empty.style.display = 'flex'; }
  else { empty.style.display = 'none'; list.innerHTML = f.map(buildTaskHTML).join(''); }
  updateNavCounts();
  updateViewTitle();
}

async function toggleTodo(id) {
  const r = await invoke('complete_todo', { id });
  playCompleteSound();
  const i = todos.findIndex((t) => t.id === id);
  if (i !== -1) todos[i] = r;
  const e = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!e) { renderTaskList(); return; }
  e.classList.add('anim-completing');
  setTimeout(() => { e.classList.remove('anim-completing'); renderTaskList(); }, 500);
}

async function openAIPanel() {
  await loadModels();
  updateModelSelect();
  document.getElementById('ai-overlay').style.display = 'flex';
  loadPending();
  analyzeTodos();
}

async function loadPending() {
  try {
    const pending = await invoke('list_pending_suggestions');
    const suggestions = document.getElementById('ai-suggestions');
    if (pending.length > 0) {
      suggestions.innerHTML = '<h4 style="margin-bottom:8px;">待处理建议 (' + pending.length + ')</h4>' + pending.map(([id, s], i) => buildSuggestionCard(s, id, i)).join('');
      suggestions.style.display = 'flex';
    }
  } catch (_) {}
}

async function updateBadge() {
  try {
    const n = await invoke('pending_suggestions_count');
    document.getElementById('btn-analyze').textContent = n > 0 ? `AI 分析 (${n})` : 'AI 分析';
  } catch (_) {}
}

function closeAIPanel() {
  document.getElementById('ai-overlay').style.display = 'none';
}

function updateModelSelect() {
  const sel = document.getElementById('ai-model-select');
  if (!sel) return;
  sel.innerHTML = models.map((m) => `<option value="${m.id}" ${m.is_active ? 'selected' : ''}>${m.name}</option>`).join('');
}

async function analyzeTodos() {
  const status = document.getElementById('ai-status');
  const analysis = document.getElementById('ai-analysis');
  const suggestions = document.getElementById('ai-suggestions');
  status.innerHTML = '<span class="ai-spinner"></span> 分析中...';
  suggestions.style.display = 'none';
  try {
    const r = await invoke('analyze_todos');
    analysis.innerHTML = buildAnalysisHTML(r.analysis);
    if (r.suggestions && r.suggestions.length > 0) {
      const batchId = Date.now().toString();
      await invoke('save_suggestions', { batchId, suggestions: r.suggestions }).catch(() => {});
      suggestions.innerHTML = '<h4 style="margin-bottom:8px;">建议</h4>' + r.suggestions.map((s, i) => buildSuggestionCard(s, -1, i)).join('');
      suggestions.style.display = 'flex';
    }
    status.textContent = '分析完成';
    updateBadge();
  } catch (e) {
    analysis.innerHTML = `<div class="ai-alert high">分析失败: ${escapeHtml(String(e))}</div>`;
    status.textContent = '失败';
  }
}

async function suggestPlan() {
  const instruction = document.getElementById('ai-instruction').value.trim();
  if (!instruction) return;
  const status = document.getElementById('ai-status');
  const suggestions = document.getElementById('ai-suggestions');
  status.innerHTML = '<span class="ai-spinner"></span> AI 思考中...';
  suggestions.style.display = 'none';
  try {
    const r = await invoke('suggest_plan', { instruction });
    suggestions.innerHTML = '<h4 style="margin-bottom:8px;">AI 建议</h4>' + r.suggestions.map((s, i) => buildSuggestionCard(s, i)).join('');
    suggestions.style.display = 'flex';
    status.textContent = '规划完成';
  } catch (e) {
    suggestions.innerHTML = `<div class="ai-alert high">规划失败: ${escapeHtml(String(e))}</div>`;
    suggestions.style.display = 'flex';
    status.textContent = '失败';
  }
}

function buildAnalysisHTML(a) {
  return `
    <div class="ai-summary">${escapeHtml(a.progress_summary)}</div>
    ${(a.risk_alerts || []).map((r) => `<div class="ai-alert ${r.risk}">${r.risk === 'high' ? '🔴' : '🟡'} ${escapeHtml(r.reason)}</div>`).join('')}
  `;
}

const aiSuggestions = [];

function buildSuggestionCard(s, dbId, idx) {
  aiSuggestions[idx] = { id: dbId, data: s };
  if (s.suggestion_type === 'create' && s.task) {
    const t = s.task;
    return `
      <div class="ai-card" id="ai-card-${idx}">
        <div class="ai-card-title">📋 ${escapeHtml(t.title)}</div>
        <div class="ai-card-meta">
          <span class="priority-badge priority-${t.priority}">${priorityLabel(t.priority)}</span>
          ${t.due_date ? `<span>📅 ${t.due_date}</span>` : ''}
          ${t.tags ? `<span>🏷 ${escapeHtml(t.tags)}</span>` : ''}
        </div>
        <div class="ai-card-reason">💡 ${escapeHtml(s.reason)}</div>
        <div class="ai-card-actions">
          <button class="btn-accept ai-accept-btn" data-idx="${idx}">采纳</button>
          <button class="ai-ignore-btn" data-idx="${idx}">忽略</button>
        </div>
      </div>`;
  } else if (s.suggestion_type === 'modify' && s.todo_id) {
    const c = s.changes || {};
    const parts = [];
    if (c.title) parts.push(`标题→${escapeHtml(c.title)}`);
    if (c.due_date) parts.push(`截止→${c.due_date}`);
    return `
      <div class="ai-card" id="ai-card-${idx}">
        <div class="ai-card-title">✏️ 修改 #${s.todo_id}</div>
        <div class="ai-card-meta">${parts.join(' · ')}</div>
        <div class="ai-card-reason">💡 ${escapeHtml(s.reason)}</div>
        <div class="ai-card-actions">
          <button class="btn-accept ai-accept-btn" data-idx="${idx}">采纳</button>
          <button class="ai-ignore-btn" data-idx="${idx}">忽略</button>
        </div>
      </div>`;
  }
  return '';
}

async function acceptSuggestion(idx) {
  const item = aiSuggestions[idx];
  if (!item) return;
  const card = document.getElementById(`ai-card-${idx}`);
  if (!card) return;
  card.style.opacity = '0.5';
  try {
    await invoke('accept_suggestion', { id: item.id, dbsuggestion: item.data });
    card.innerHTML = '<div class="ai-card-title" style="color:var(--color-checkbox-done)">✓ 已采纳</div>';
    loadData().then(() => renderTaskList());
    updateBadge();
  } catch (e) {
    card.style.opacity = '1';
    card.innerHTML += `<div class="ai-alert high">采纳失败: ${escapeHtml(String(e))}</div>`;
  }
}

function ignoreSuggestion(idx) {
  const card = document.getElementById(`ai-card-${idx}`);
  if (card) card.style.display = 'none';
}

function openModelConfig() {
  const list = document.getElementById('model-list');
  const presets = [
    { name: 'DeepSeek V3', provider: 'deepseek', api_base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'DeepSeek R1', provider: 'deepseek', api_base: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner' },
    { name: 'GPT-4o', provider: 'openai', api_base: 'https://api.openai.com/v1', model: 'gpt-4o' },
    { name: 'Claude 3.5', provider: 'claude', api_base: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-20241022' },
    { name: 'Kimi', provider: 'kimi', api_base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  ];
  const hasPwd = false;
  list.innerHTML = presets.map((p) => {
    const existing = models.find((m) => m.provider === p.provider);
    return `
      <div class="model-item${existing && existing.is_active ? ' active' : ''}">
        <span class="model-item-name">${p.name}</span>
        <span style="font-size:11px;color:var(--color-text-hint)">${p.model}</span>
        <input class="model-item-key" value="${existing ? existing.api_key : ''}" placeholder="API Key" data-provider="${p.provider}" data-base="${p.api_base}" data-name="${p.name}" data-model="${p.model}" />
        ${existing ? `<button class="btn-ghost model-activate-btn" style="font-size:11px;" data-id="${existing.id}">${existing.is_active ? '✓' : '选用'}</button><button class="btn-ghost model-delete-btn" style="font-size:11px;color:var(--color-accent)" data-id="${existing.id}">删</button>` : `<button class="btn-primary model-add-btn" style="font-size:11px;" data-name="${p.name}" data-provider="${p.provider}" data-base="${p.api_base}" data-model="${p.model}">添加</button>`}
      </div>`;}).join('');
  document.getElementById('model-overlay').style.display = 'flex';
}

async function addModel(name, provider, apiBase, model) {
  const inp = document.querySelector(`.model-item-key[data-provider="${provider}"]`);
  const key = inp ? inp.value.trim() : '';
  if (!key) { alert('请输入 API Key'); return; }
  await invoke('create_model_config', { input: { name, provider, api_base: apiBase, api_key: key, model_name: model } });
  await loadModels();
  openModelConfig();
}

async function activateModel(id) {
  await invoke('update_model_config', { id, input: { is_active: true } });
  await loadModels();
  openModelConfig();
  updateModelSelect();
}

function closeModelConfig() { document.getElementById('model-overlay').style.display = 'none'; }

async function deleteTodo(id) {
  const td = todos.find((t) => t.id === id);
  if (!td) return;
  recentlyDeleted = td;
  todos = todos.filter((t) => t.id !== id);
  playDeleteSound();
  invoke('delete_todo', { id }).catch(() => {});
  const e = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!e) { showToast(); renderTaskList(); return; }
  e.classList.add('anim-deleting');
  setTimeout(() => { if (e.parentNode) e.remove(); updateNavCounts(); showToast(); }, 260);
  updateNavCounts();
}

async function addTodo() {
  const title = document.getElementById('quick-add-input').value.trim();
  if (!title) return;
  const td = await invoke('create_todo', {
    input: {
      title,
      priority: document.getElementById('input-priority').value,
      tags: document.getElementById('input-tags').value.trim(),
      goal_id: (() => { const v = document.getElementById('input-goal').value; return v ? parseInt(v) : null; })(),
      category_id: (() => { const v = document.getElementById('input-category').value; return v ? parseInt(v) : null; })(),
      due_at: document.getElementById('input-due').value ? new Date(document.getElementById('input-due').value).toISOString() : null,
    },
  });
  todos.push(td);
  nextId = Math.max(nextId, td.id + 1);
  resetQuickAdd();
  renderTaskList();
}

function resetQuickAdd() {
  const inputs = ['quick-add-input', 'input-due', 'input-tags'];
  inputs.forEach((id) => { document.getElementById(id).value = ''; });
  document.getElementById('input-priority').value = 'medium';
  document.getElementById('quick-add-actions').style.display = 'none';
}

function showToast() {
  if (!recentlyDeleted) return;
  if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
  const ta = document.getElementById('toast-area');
  ta.innerHTML = `<div class="toast-inner"><span class="toast-text">「${escapeHtml(recentlyDeleted.title)}」已删除</span><button class="toast-undo" id="toast-undo-btn">撤销</button></div>`;
  ta.classList.add('visible');
  document.getElementById('toast-undo-btn').addEventListener('click', undoDelete);
  deleteTimer = setTimeout(dismissToast, 5000);
}

async function undoDelete() {
  if (!recentlyDeleted) return;
  clearTimeout(deleteTimer); deleteTimer = null;
  const r = recentlyDeleted;
  recentlyDeleted = null;
  const created = await invoke('create_todo', {
    input: { title: r.title, priority: r.priority, tags: r.tags, goal_id: r.goal_id, category_id: r.category_id, due_at: r.due_at },
  });
  if (r.completed_at) {
    const t = await invoke('complete_todo', { id: created.id });
    const i = todos.findIndex((x) => x.id === created.id);
    if (i !== -1) todos[i] = t;
  } else { todos.push(created); }
  dismissToast();
  renderTaskList();
  setTimeout(() => {
    const e = document.querySelector(`.task-item[data-id="${created.id}"]`);
    if (e) { e.classList.add('anim-restoring'); e.addEventListener('animationend', () => e.classList.remove('anim-restoring'), { once: true }); }
  }, 50);
}

function dismissToast() {
  const ta = document.getElementById('toast-area');
  recentlyDeleted = null;
  if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
  ta.classList.remove('visible');
  setTimeout(() => { ta.innerHTML = ''; }, 300);
}

function getCategoryById(id) { return categories.find((c) => c.id === id); }

function getDateDisplay(iso) {
  if (!iso) return '设置截止日期';
  if (isToday(iso)) return '今天';
  const d = new Date(iso);
  const t = new Date(); t.setDate(t.getDate() + 1);
  if (d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()) return '明天';
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${w[d.getDay()]}`;
}

function startEdit(id) {
  if (editingId === id) return;
  if (editingId !== null) cancelEdit(editingId);
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  const elem = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!elem || elem.classList.contains('anim-completing') || elem.classList.contains('anim-deleting')) return;
  editingId = id;
  editingDueDate = todo.due_at;
  editingTags = (todo.tags || '').split(',').map((x) => x.trim()).filter((x) => x);
  if (editingDueDate) { const d = new Date(editingDueDate); calendarYear = d.getFullYear(); calendarMonth = d.getMonth() + 1; }
  else { const n = new Date(); calendarYear = n.getFullYear(); calendarMonth = n.getMonth() + 1; }
  elem.classList.add('editing');
  elem.innerHTML = buildEditFormHTML(todo);
  renderEditTags();
  const ti = elem.querySelector('.edit-title');
  if (ti) { ti.focus(); ti.setSelectionRange(ti.value.length, ti.value.length); }
}

function buildEditFormHTML(todo) {
  return `
    <div class="task-checkbox" data-action="toggle">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="edit-form">
      <input type="text" class="edit-title" value="${escapeHtml(todo.title)}">
      <div class="edit-row">
        <select class="edit-priority">
          <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>高</option>
          <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>中</option>
          <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>低</option>
        </select>
        <div class="edit-due-wrapper">
          <button class="edit-due-btn" type="button">${getDateDisplay(editingDueDate)}</button>
          ${editingDueDate ? '<button class="edit-due-clear" type="button">✕</button>' : ''}
          <div class="date-picker" style="display:none;">
            <div class="quick-date-btns">
              <button class="quick-date-btn" data-type="today" type="button">今天</button>
              <button class="quick-date-btn" data-type="tomorrow" type="button">明天</button>
              <button class="quick-date-btn" data-type="weekend" type="button">本周末</button>
              <button class="quick-date-btn" data-type="next-week" type="button">下周</button>
              <button class="quick-date-btn" data-type="clear" type="button">清除</button>
            </div>
            <div class="calendar-header">
              <button class="cal-nav-btn cal-nav-prev" type="button">‹</button>
              <span class="calendar-month">${calendarYear}年 ${calendarMonth}月</span>
              <button class="cal-nav-btn cal-nav-next" type="button">›</button>
            </div>
            <div class="calendar-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
            <div class="calendar-grid"></div>
          </div>
        </div>
        <select class="edit-category">
          <option value="">未分类</option>
          ${categories.map((c) => `<option value="${c.id}" ${todo.category_id === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <select class="edit-goal">
          <option value="">无目标</option>
          ${goals.filter((g) => g.status === 'active').map((g) => `<option value="${g.id}" ${todo.goal_id === g.id ? 'selected' : ''}>${escapeHtml(g.title)}</option>`).join('')}
        </select>
      </div>
      <div class="edit-tags-wrapper">
        <div class="edit-tags-selected"></div>
        <input type="text" class="edit-tags-input" placeholder="添加标签..." autocomplete="off">
        <div class="edit-tags-available"></div>
      </div>
      <div class="edit-actions">
        <button class="btn-primary edit-save" type="button">保存</button>
        <button class="btn-ghost edit-cancel" type="button">取消</button>
      </div>
    </div>
    <button class="task-delete" data-action="delete" title="删除">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    </button>`;
}

async function saveEdit(id) {
  const elem = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!elem) return;
  const ti = elem.querySelector('.edit-title');
  const ps = elem.querySelector('.edit-priority');
  const cs = elem.querySelector('.edit-category');
  const gs = elem.querySelector('.edit-goal');
  const input = {
    title: ti.value.trim() || undefined,
    priority: ps.value,
    tags: editingTags.length > 0 ? editingTags.join(',') : '',
    category_id: cs.value ? parseInt(cs.value) : null,
    goal_id: gs.value ? parseInt(gs.value) : null,
    due_at: editingDueDate || '',
  };
  const u = await invoke('update_todo', { id, input });
  const i = todos.findIndex((t) => t.id === id);
  if (i !== -1) todos[i] = u;
  editingId = null; editingTags = []; editingDueDate = null;
  elem.classList.remove('editing');
  elem.outerHTML = buildTaskHTML(u);
}

function cancelEdit(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) { editingId = null; editingTags = []; editingDueDate = null; return; }
  const elem = document.querySelector(`.task-item[data-id="${id}"]`);
  if (elem) { elem.classList.remove('editing'); elem.outerHTML = buildTaskHTML(todo); }
  editingId = null; editingTags = []; editingDueDate = null;
}

function openDatePicker() {
  const p = document.querySelector('.date-picker');
  if (p) { p.style.display = 'block'; renderCalendar(); }
}
function closeDatePicker() {
  const p = document.querySelector('.date-picker');
  if (p) p.style.display = 'none';
}
function renderCalendar() {
  const grid = document.querySelector('.calendar-grid');
  const label = document.querySelector('.calendar-month');
  if (!grid || !label) return;
  label.textContent = `${calendarYear}年 ${calendarMonth}月`;
  const jm = calendarMonth - 1;
  const first = new Date(calendarYear, jm, 1);
  const sd = first.getDay() || 7;
  const dim = new Date(calendarYear, jm + 1, 0).getDate();
  const pd = new Date(calendarYear, jm, 0).getDate();
  const n = new Date();
  const ts = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  let ds = '';
  if (editingDueDate) { const d = new Date(editingDueDate); ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  let h = '', day = 1, nd = 1;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      if (r * 7 + c < sd - 1) {
        const d = pd - (sd - 1) + r * 7 + c + 1;
        h += `<span class="cal-day other-month">${d}</span>`;
      } else if (day > dim) {
        h += `<span class="cal-day other-month">${nd}</span>`; nd++;
      } else {
        const date = `${calendarYear}-${String(calendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const cls = `cal-day${date === ts ? ' today' : ''}${date === ds ? ' selected' : ''}`;
        h += `<span class="${cls}" data-date="${date}">${day}</span>`; day++;
      }
    }
  }
  grid.innerHTML = h;
}
function navigateMonth(dir) {
  calendarMonth += dir;
  if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
  if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
  renderCalendar();
}
function selectQuickDate(type) {
  if (type === 'clear') { editingDueDate = null; }
  else { editingDueDate = getQuickDate(type); }
  updateDueDisplay(); closeDatePicker();
}
function selectCalendarDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  editingDueDate = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}T23:59:00`;
  updateDueDisplay(); closeDatePicker();
}
function getQuickDate(type) {
  const pad = (n) => String(n).padStart(2, '0');
  const n = new Date();
  let t;
  switch (type) {
    case 'today': t = n; break;
    case 'tomorrow': t = new Date(n); t.setDate(t.getDate() + 1); break;
    case 'weekend': t = new Date(n); t.setDate(t.getDate() + (6 - t.getDay())); break;
    case 'next-week': t = new Date(n); t.setDate(t.getDate() + (8 - t.getDay() || 1)); break;
    default: return null;
  }
  return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}T23:59:00`;
}
function updateDueDisplay() {
  const btn = document.querySelector('.edit-due-btn');
  const clr = document.querySelector('.edit-due-clear');
  if (!btn) return;
  btn.textContent = getDateDisplay(editingDueDate);
  if (editingDueDate && !clr) {
    const n = document.createElement('button'); n.className = 'edit-due-clear'; n.type = 'button'; n.textContent = '✕'; btn.parentElement.appendChild(n);
  } else if (!editingDueDate && clr) { clr.remove(); }
}

function getAllTags() {
  const s = new Set();
  todos.forEach((t) => { (t.tags || '').split(',').forEach((x) => { const v = x.trim(); if (v) s.add(v); }); });
  return [...s];
}
function addEditingTag(tag) {
  const v = tag.trim();
  if (!v || editingTags.includes(v)) return;
  editingTags.push(v); renderEditTags();
}
function removeEditingTag(tag) {
  editingTags = editingTags.filter((t) => t !== tag); renderEditTags();
}
function renderEditTags() {
  const sel = document.querySelector('.edit-tags-selected');
  const avl = document.querySelector('.edit-tags-available');
  if (!sel || !avl) return;
  sel.innerHTML = editingTags.map((x) => `<span class="edit-tag edit-tag-selected" data-tag="${escapeHtml(x)}">${escapeHtml(x)}<button class="tag-remove-btn" type="button">✕</button></span>`).join('');
  const all = getAllTags().filter((t) => !editingTags.includes(t));
  avl.innerHTML = all.map((x) => `<span class="edit-tag edit-tag-available" data-tag="${escapeHtml(x)}">${escapeHtml(x)}</span>`).join('');
}

function syncQuickAddForm() {
  const cs = document.getElementById('input-category');
  if (cs) {
    cs.value = currentView === 'category' && currentCategoryId !== null ? currentCategoryId : '';
  }
  const gs = document.getElementById('input-goal');
  if (gs) {
    gs.value = currentView === 'goal' && currentGoalId !== null ? currentGoalId : '';
  }
  const di = document.getElementById('input-due');
  if (!di) return;
  if (currentView === 'today') {
    const d = new Date();
    di.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  } else if (currentView === 'upcoming') {
    const d = new Date(); d.setDate(d.getDate() + 1);
    di.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  } else { di.value = ''; }
}

function renderCategories() {
  const container = document.getElementById('category-nav');
  if (!container) return;
  container.innerHTML = categories.map((c) => `
    <a href="#" class="nav-item nav-category${currentCategoryId === c.id && currentView === 'category' ? ' active' : ''}" data-category-id="${c.id}">
      ${renderIcon(c.icon, 18)}
      <span>${escapeHtml(c.name)}</span>
      <div class="nav-category-actions">
        <button class="nav-cat-btn" data-action="edit-category" data-id="${c.id}" title="编辑分类">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z M15 5l4 4"/></svg>
        </button>
      </div>
    </a>`).join('');
  updateCategorySelects();
}

function updateCategorySelects() {
  const opts = '<option value="">未分类</option>' + categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const sel = document.getElementById('input-category');
  if (sel) { const cur = sel.value; sel.innerHTML = opts; sel.value = cur; }
}

function openCategoryModal(categoryId) {
  editingCategoryId = categoryId !== undefined ? categoryId : null;
  resetDeleteButton();
  const isEdit = editingCategoryId !== null;
  document.getElementById('modal-title').textContent = isEdit ? '编辑分类' : '添加分类';
  document.getElementById('modal-delete').style.display = isEdit ? '' : 'none';
  document.getElementById('modal-name').value = '';
  document.getElementById('modal-save').disabled = true;
  let selectedIcon = 'target';
  if (isEdit) {
    const cat = categories.find((c) => c.id === editingCategoryId);
    if (cat) { document.getElementById('modal-name').value = cat.name; selectedIcon = cat.icon; document.getElementById('modal-save').disabled = false; }
  }
  renderModalIcons(selectedIcon);
  document.getElementById('modal-overlay').style.display = 'flex';
  document.getElementById('modal-name').focus();
}

function closeCategoryModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  editingCategoryId = null;
  resetDeleteButton();
}

function renderModalIcons(selectedKey) {
  const grid = document.getElementById('modal-icon-grid');
  if (!grid) return;
  grid.innerHTML = Object.keys(ICONS).map((key) => `
    <div class="modal-icon-item${key === selectedKey ? ' selected' : ''}" data-icon="${key}" title="${ICONS[key].name}">
      ${renderIcon(key, 22)}
    </div>`).join('');
}

async function saveCategory() {
  const name = document.getElementById('modal-name').value.trim();
  if (!name) return;
  const icon = document.querySelector('.modal-icon-item.selected')?.dataset.icon || 'target';
  if (editingCategoryId !== null) {
    const u = await invoke('update_category', { id: editingCategoryId, input: { name, icon } });
    const i = categories.findIndex((c) => c.id === editingCategoryId);
    if (i !== -1) categories[i] = u;
  } else {
    const c = await invoke('create_category', { input: { name, icon } });
    categories.push(c);
    nextCategoryId = Math.max(nextCategoryId, c.id + 1);
  }
  closeCategoryModal();
  renderCategories();
  renderTaskList();
}

async function deleteCategory() {
  if (!deleteConfirming) {
    deleteConfirming = true;
    const btn = document.getElementById('modal-delete');
    btn.textContent = '确认删除？';
    btn.classList.add('danger');
    return;
  }
  await invoke('delete_category', { id: editingCategoryId });
  todos.forEach((t) => { if (t.category_id === editingCategoryId) t.category_id = null; });
  categories = categories.filter((c) => c.id !== editingCategoryId);
  if (currentView === 'category' && currentCategoryId === editingCategoryId) {
    currentView = 'all'; currentCategoryId = null;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
    const a = document.querySelector('.nav-item[data-view="all"]');
    if (a) a.classList.add('active');
  }
  closeCategoryModal();
  renderCategories();
  renderTaskList();
  resetDeleteButton();
}

function resetDeleteButton() {
  deleteConfirming = false;
  const btn = document.getElementById('modal-delete');
  if (btn) { btn.textContent = '删除分类'; btn.classList.remove('danger'); }
}

function renderGoals() {
  const container = document.getElementById('goal-nav');
  if (!container) return;
  container.innerHTML = goals.map((g) => `
    <a href="#" class="nav-item nav-category${currentGoalId === g.id && currentView === 'goal' ? ' active' : ''}" data-goal-id="${g.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="nav-icon">
        ${g.status === 'completed' ? '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' : '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="4" r="2"/>'}
      </svg>
      <span>${escapeHtml(g.title)}</span>
      <div class="nav-category-actions">
        <button class="nav-cat-btn" data-action="edit-goal" data-id="${g.id}" title="编辑目标">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5z M15 5l4 4"/></svg>
        </button>
      </div>
    </a>`).join('');
  updateGoalSelects();
}

function updateGoalSelects() {
  const opts = '<option value="">无目标</option>' + goals.filter((g) => g.status === 'active').map((g) => `<option value="${g.id}">${escapeHtml(g.title)}</option>`).join('');
  const sel = document.getElementById('input-goal');
  if (sel) { const cur = sel.value; sel.innerHTML = opts; sel.value = cur; }
  document.querySelectorAll('.edit-goal').forEach((s) => { const cur = s.value; s.innerHTML = opts; s.value = cur; });
}

function openGoalModal(goalId) {
  editingGoalId = goalId !== undefined ? goalId : null;
  resetGoalDeleteButton();
  const isEdit = editingGoalId !== null;
  document.getElementById('goal-modal-title').textContent = isEdit ? '编辑目标' : '添加目标';
  document.getElementById('goal-modal-delete').style.display = isEdit ? '' : 'none';
  document.getElementById('goal-modal-name').value = '';
  document.getElementById('goal-modal-desc').value = '';
  document.getElementById('goal-modal-date').value = '';
  document.getElementById('goal-modal-save').disabled = true;
  if (isEdit) {
    const g = goals.find((x) => x.id === editingGoalId);
    if (g) {
      document.getElementById('goal-modal-name').value = g.title;
      document.getElementById('goal-modal-desc').value = g.description;
      if (g.target_date) document.getElementById('goal-modal-date').value = g.target_date.split('T')[0];
      document.getElementById('goal-modal-save').disabled = false;
    }
  }
  document.getElementById('goal-modal-overlay').style.display = 'flex';
  document.getElementById('goal-modal-name').focus();
}

function closeGoalModal() {
  document.getElementById('goal-modal-overlay').style.display = 'none';
  editingGoalId = null;
  resetGoalDeleteButton();
}

async function saveGoal() {
  const name = document.getElementById('goal-modal-name').value.trim();
  if (!name) return;
  const desc = document.getElementById('goal-modal-desc').value.trim();
  const dv = document.getElementById('goal-modal-date').value;
  const target = dv ? `${dv}T23:59:00` : null;
  if (editingGoalId !== null) {
    const u = await invoke('update_goal', { id: editingGoalId, input: { title: name, description: desc, target_date: target || '' } });
    const i = goals.findIndex((g) => g.id === editingGoalId);
    if (i !== -1) goals[i] = u;
  } else {
    const g = await invoke('create_goal', { input: { title: name, description: desc, target_date: target } });
    goals.push(g);
  }
  closeGoalModal();
  renderGoals();
}

async function deleteGoal() {
  if (!goalDeleteConfirming) {
    goalDeleteConfirming = true;
    const btn = document.getElementById('goal-modal-delete');
    btn.textContent = '确认删除？';
    btn.classList.add('danger');
    return;
  }
  await invoke('delete_goal', { id: editingGoalId });
  todos.forEach((t) => { if (t.goal_id === editingGoalId) t.goal_id = null; });
  goals = goals.filter((g) => g.id !== editingGoalId);
  closeGoalModal();
  renderGoals();
  renderTaskList();
  resetGoalDeleteButton();
}

function resetGoalDeleteButton() {
  goalDeleteConfirming = false;
  const btn = document.getElementById('goal-modal-delete');
  if (btn) { btn.textContent = '删除目标'; btn.classList.remove('danger'); }
}

document.addEventListener('DOMContentLoaded', () => {
  const taskList = document.getElementById('task-list');
  taskList.addEventListener('click', (e) => {
    const item = e.target.closest('.task-item');
    if (!item || item.classList.contains('anim-completing') || item.classList.contains('anim-deleting')) return;
    const id = parseInt(item.dataset.id);

    if (e.target.closest('[data-action="delete"]')) { if (editingId !== null) cancelEdit(editingId); deleteTodo(id); return; }
    if (e.target.closest('.task-checkbox')) { if (editingId !== null) cancelEdit(editingId); toggleTodo(id); return; }

    if (item.classList.contains('editing')) {
      if (e.target.closest('.edit-save')) { saveEdit(id); return; }
      if (e.target.closest('.edit-cancel')) { cancelEdit(id); return; }
      if (e.target.closest('.edit-due-btn')) { e.preventDefault(); openDatePicker(); return; }
      if (e.target.closest('.edit-due-clear')) { editingDueDate = null; updateDueDisplay(); return; }
      if (e.target.closest('.cal-day:not(.other-month)')) { selectCalendarDate(e.target.closest('.cal-day').dataset.date); return; }
      if (e.target.closest('.cal-nav-prev')) { navigateMonth(-1); return; }
      if (e.target.closest('.cal-nav-next')) { navigateMonth(1); return; }
      if (e.target.closest('.quick-date-btn')) { selectQuickDate(e.target.closest('.quick-date-btn').dataset.type); return; }
      if (e.target.closest('.edit-tags-available .edit-tag')) { addEditingTag(e.target.closest('.edit-tag').dataset.tag); return; }
      if (e.target.closest('.edit-tags-selected .tag-remove-btn')) { removeEditingTag(e.target.closest('.edit-tags-selected .edit-tag').dataset.tag); return; }
      return;
    }

    startEdit(id);
  });

  taskList.addEventListener('keydown', (e) => {
    if (!editingId) return;
    if (e.target.closest('.edit-tags-input')) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = e.target.value.replace(/,/g, '').trim(); if (v) addEditingTag(v); e.target.value = ''; return; }
      if (e.key === 'Backspace' && e.target.value === '' && editingTags.length > 0) { removeEditingTag(editingTags[editingTags.length - 1]); return; }
    }
    if (e.key === 'Escape') { const p = document.querySelector('.date-picker'); if (p && p.style.display !== 'none') { closeDatePicker(); return; } cancelEdit(editingId); return; }
    if (e.key === 'Enter' && e.target.closest('.edit-title')) { e.preventDefault(); saveEdit(editingId); }
  });

  document.addEventListener('mousedown', (e) => {
    if (!editingId) return;
    const p = document.querySelector('.date-picker');
    if (!p || p.style.display === 'none') return;
    if (!p.contains(e.target) && !e.target.closest('.edit-due-btn') && !e.target.closest('.edit-due-clear')) closeDatePicker();
  });

  document.getElementById('quick-add-input').addEventListener('focus', () => {
    document.getElementById('quick-add-actions').style.display = 'flex';
  });
  document.getElementById('quick-add-input').addEventListener('keydown', (ke) => {
    if (ke.key === 'Enter') { ke.preventDefault(); const a = document.getElementById('quick-add-actions'); a.style.display === 'none' ? (a.style.display = 'flex') : addTodo(); }
    if (ke.key === 'Escape') resetQuickAdd();
  });
  document.getElementById('btn-add').addEventListener('click', addTodo);
  document.getElementById('btn-cancel-add').addEventListener('click', resetQuickAdd);

  document.querySelector('.sidebar-nav').addEventListener('click', (lv) => {
    const navItem = lv.target.closest('.nav-item');
    if (!navItem) return;
    if (lv.target.closest('.nav-cat-btn')) {
      lv.preventDefault(); lv.stopPropagation();
      const btn = lv.target.closest('.nav-cat-btn');
      if (btn.dataset.action === 'edit-goal') { openGoalModal(parseInt(btn.dataset.id)); return; }
      openCategoryModal(parseInt(btn.dataset.id));
      return;
    }
    if (navItem.id === 'btn-add-category') { lv.preventDefault(); openCategoryModal(); return; }
    if (navItem.id === 'btn-add-goal') { lv.preventDefault(); openGoalModal(); return; }
    const catId = parseInt(navItem.dataset.categoryId);
    const goalId = parseInt(navItem.dataset.goalId);
    if (!isNaN(goalId)) {
      lv.preventDefault();
      currentView = 'goal'; currentCategoryId = null; currentGoalId = goalId;
    } else if (!isNaN(catId)) {
      lv.preventDefault();
      currentView = 'category'; currentGoalId = null; currentCategoryId = catId;
    } else {
      lv.preventDefault();
      currentView = navItem.dataset.view || 'all'; currentCategoryId = null; currentGoalId = null;
    }
    document.querySelectorAll('.sidebar-nav .nav-item').forEach((n) => n.classList.remove('active'));
    navItem.classList.add('active');
    syncQuickAddForm();
    renderTaskList();
  });

  document.getElementById('modal-close').addEventListener('click', closeCategoryModal);
  document.getElementById('modal-cancel').addEventListener('click', closeCategoryModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeCategoryModal(); });
  document.getElementById('modal-save').addEventListener('click', saveCategory);
  document.getElementById('modal-delete').addEventListener('click', deleteCategory);
  document.getElementById('modal-name').addEventListener('input', (e) => { document.getElementById('modal-save').disabled = !e.target.value.trim(); });
  document.getElementById('modal-icon-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.modal-icon-item');
    if (!item) return;
    document.querySelectorAll('.modal-icon-item').forEach((i) => i.classList.remove('selected'));
    item.classList.add('selected');
    document.getElementById('modal-save').disabled = !document.getElementById('modal-name').value.trim();
  });

  document.getElementById('goal-modal-close').addEventListener('click', closeGoalModal);
  document.getElementById('goal-modal-cancel').addEventListener('click', closeGoalModal);
  document.getElementById('goal-modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGoalModal(); });
  document.getElementById('goal-modal-save').addEventListener('click', saveGoal);
  document.getElementById('goal-modal-delete').addEventListener('click', deleteGoal);
  document.getElementById('goal-modal-name').addEventListener('input', (e) => { document.getElementById('goal-modal-save').disabled = !e.target.value.trim(); });

  document.getElementById('btn-analyze').addEventListener('click', openAIPanel);
  try {
    document.getElementById('ai-close').addEventListener('click', closeAIPanel);
    document.getElementById('ai-close-btn').addEventListener('click', closeAIPanel);
    document.getElementById('ai-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAIPanel(); });
    document.getElementById('ai-plan-btn').addEventListener('click', suggestPlan);
    document.getElementById('ai-config-btn').addEventListener('click', openModelConfig);
    document.getElementById('ai-body').addEventListener('click', (e) => {
      const acceptBtn = e.target.closest('.ai-accept-btn');
      const ignoreBtn = e.target.closest('.ai-ignore-btn');
      if (acceptBtn) { acceptSuggestion(parseInt(acceptBtn.dataset.idx)); return; }
      if (ignoreBtn) { ignoreSuggestion(parseInt(ignoreBtn.dataset.idx)); return; }
    });
    document.getElementById('model-close').addEventListener('click', closeModelConfig);
    document.getElementById('model-cancel').addEventListener('click', closeModelConfig);
    document.getElementById('model-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModelConfig(); });
    document.getElementById('model-list').addEventListener('click', async (e) => {
      const addBtn = e.target.closest('.model-add-btn');
      const actBtn = e.target.closest('.model-activate-btn');
      if (addBtn) {
        const { provider, base, name, model } = addBtn.dataset;
        const inp = document.querySelector(`.model-item-key[data-provider="${provider}"]`);
        if (!inp || !inp.value.trim()) { alert('请输入 API Key'); return; }
        await invoke('create_model_config', { input: { name, provider, api_base: base, api_key: inp.value.trim(), model_name: model } });
        await loadModels();
        openModelConfig();
      }
      if (actBtn) {
        await invoke('update_model_config', { id: parseInt(actBtn.dataset.id), input: { is_active: true } });
        await loadModels(); updateModelSelect(); openModelConfig();
      }
      const delBtn = e.target.closest('.model-delete-btn');
      if (delBtn) {
        if (confirm('确定删除此模型配置？')) {
          await invoke('delete_model_config', { id: parseInt(delBtn.dataset.id) });
          await loadModels(); updateModelSelect(); openModelConfig();
        }
      }
    });
  } catch (e) { console.error('AI panel init failed:', e); }

  startApp();
});

async function startApp() {
  try { await loadData(); }
  catch (e) { console.error('loadData failed:', e); }
  renderCategories();
  renderGoals();
  renderTaskList();
  updateBadge();
}
