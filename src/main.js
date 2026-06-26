import { playCompleteSound, playDeleteSound } from './sound.js';

const MOCK_TODOS = [
  { id: 1, title: '完成 Rust 内存管理章节学习', priority: 'high', tags: 'Rust,课程', created_at: '2026-06-24T08:00:00', due_at: '2026-06-26T23:59:00', completed_at: null },
  { id: 2, title: '写数据库设计文档', priority: 'medium', tags: '课程,设计', created_at: '2026-06-25T10:00:00', due_at: '2026-06-28T23:59:00', completed_at: null },
  { id: 3, title: '复习线性代数第三章', priority: 'low', tags: '数学', created_at: '2026-06-25T14:00:00', due_at: null, completed_at: null },
  { id: 4, title: '整理 Tauri 项目结构', priority: 'high', tags: '项目,Tauri', created_at: '2026-06-23T16:00:00', due_at: '2026-06-25T12:00:00', completed_at: null },
  { id: 5, title: '提交课程中期报告', priority: 'medium', tags: '课程', created_at: '2026-06-22T09:00:00', due_at: '2026-06-24T18:00:00', completed_at: '2026-06-24T16:30:00' },
];

let todos = [...MOCK_TODOS];
let nextId = Math.max(0, ...todos.map((t) => t.id)) + 1;
let currentView = 'all';
let recentlyDeleted = null;
let deleteTimer = null;

function isOverdue(todo) {
  if (!todo.due_at || todo.completed_at) return false;
  return new Date(todo.due_at) < new Date();
}

function isDueSoon(todo) {
  if (!todo.due_at || todo.completed_at || isOverdue(todo)) return false;
  return new Date(todo.due_at) - new Date() < 24 * 60 * 60 * 1000;
}

function isToday(dueStr) {
  if (!dueStr) return false;
  const d = new Date(dueStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function formatDueDate(dueStr) {
  if (!dueStr) return '';
  const d = new Date(dueStr);
  if (isToday(dueStr)) return '今天';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.getFullYear() === tomorrow.getFullYear() && d.getMonth() === tomorrow.getMonth() && d.getDate() === tomorrow.getDate()) return '明天';
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}月${d.getDate()}日 ${wd[d.getDay()]}`;
}

function priorityLabel(p) {
  return { high: '高', medium: '中', low: '低' }[p] || p;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

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
  return result.sort((a, b) => {
    if (currentView === 'completed') return new Date(b.completed_at) - new Date(a.completed_at);
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at) - new Date(b.due_at);
  });
}

function updateNavCounts() {
  const active = todos.filter((t) => !t.completed_at);
  document.getElementById('count-all').textContent = active.length;
  document.getElementById('count-today').textContent = active.filter((t) => t.due_at && isToday(t.due_at)).length;
  document.getElementById('count-upcoming').textContent = active.filter((t) => t.due_at && new Date(t.due_at) > new Date()).length;
  document.getElementById('count-completed').textContent = todos.filter((t) => t.completed_at).length;
}

function updateViewTitle() {
  const titles = { all: '全部任务', today: '今天', upcoming: '计划中', completed: '已完成' };
  document.getElementById('view-title').textContent = titles[currentView] || '全部任务';
}

function buildTaskHTML(t) {
  return `
    <li class="task-item${t.completed_at ? ' completed' : ''}" data-id="${t.id}">
      <div class="task-checkbox" data-action="toggle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="task-body">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">
          <span class="priority-badge priority-${t.priority}">${priorityLabel(t.priority)}</span>
          ${t.due_at ? `<span class="task-due${isOverdue(t) ? ' overdue' : ''}${isDueSoon(t) ? ' soon' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${formatDueDate(t.due_at)}
          </span>` : ''}
          <span class="task-tags">
            ${(t.tags || '').split(',').filter((tag) => tag.trim()).map((tag) => `<span class="tag-pill">${escapeHtml(tag.trim())}</span>`).join('')}
          </span>
        </div>
      </div>
      <button class="task-delete" data-action="delete" title="删除">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </li>`;
}

function renderTaskList() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const filtered = filteredTodos();
  if (filtered.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    list.innerHTML = filtered.map(buildTaskHTML).join('');
  }
  updateNavCounts();
  updateViewTitle();
}

function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.completed_at = todo.completed_at ? null : new Date().toISOString();
  playCompleteSound();

  const elem = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!elem) { renderTaskList(); saveToStorage(); return; }

  elem.classList.add('anim-completing');
  setTimeout(() => {
    elem.classList.remove('anim-completing');
    renderTaskList();
    saveToStorage();
  }, 500);
}

function deleteTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  recentlyDeleted = todo;
  todos = todos.filter((t) => t.id !== id);
  playDeleteSound();

  const elem = document.querySelector(`.task-item[data-id="${id}"]`);
  if (!elem) { showToast(); renderTaskList(); saveToStorage(); return; }

  elem.classList.add('anim-deleting');
  setTimeout(() => {
    if (elem.parentNode) elem.remove();
    updateNavCounts();
    showToast();
  }, 260);
  updateNavCounts();
  saveToStorage();
}

function addTodo() {
  const titleEl = document.getElementById('quick-add-input');
  const title = titleEl.value.trim();
  if (!title) return;

  const todo = {
    id: nextId++,
    title,
    priority: document.getElementById('input-priority').value,
    tags: document.getElementById('input-tags').value.trim(),
    created_at: new Date().toISOString(),
    due_at: document.getElementById('input-due').value ? new Date(document.getElementById('input-due').value).toISOString() : null,
    completed_at: null,
  };

  todos.push(todo);
  resetQuickAdd();
  renderTaskList();
  saveToStorage();
}

function resetQuickAdd() {
  document.getElementById('quick-add-input').value = '';
  document.getElementById('input-due').value = '';
  document.getElementById('input-priority').value = 'medium';
  document.getElementById('input-tags').value = '';
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

function undoDelete() {
  if (!recentlyDeleted) return;
  clearTimeout(deleteTimer); deleteTimer = null;
  const restored = recentlyDeleted;
  recentlyDeleted = null;
  todos.push(restored);
  dismissToast();
  renderTaskList();
  saveToStorage();
  setTimeout(() => {
    const elem = document.querySelector(`.task-item[data-id="${restored.id}"]`);
    if (elem) {
      elem.classList.add('anim-restoring');
      elem.addEventListener('animationend', () => elem.classList.remove('anim-restoring'), { once: true });
    }
  }, 50);
}

function dismissToast() {
  const ta = document.getElementById('toast-area');
  recentlyDeleted = null;
  if (deleteTimer) { clearTimeout(deleteTimer); deleteTimer = null; }
  ta.classList.remove('visible');
  setTimeout(() => { ta.innerHTML = ''; }, 300);
}

function saveToStorage() {
  try { localStorage.setItem('mingjing_todos', JSON.stringify(todos)); } catch (_) {}
}

function loadFromStorage() {
  try {
    const data = localStorage.getItem('mingjing_todos');
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) { todos = parsed; nextId = Math.max(0, ...todos.map((t) => t.id)) + 1; }
    }
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();

  document.getElementById('task-list').addEventListener('click', (e) => {
    const item = e.target.closest('.task-item');
    if (!item || item.classList.contains('anim-completing') || item.classList.contains('anim-deleting')) return;
    const id = parseInt(item.dataset.id);
    if (e.target.closest('[data-action="delete"]')) { deleteTodo(id); return; }
    toggleTodo(id);
  });

  // Quick add
  document.getElementById('quick-add-input').addEventListener('focus', () => {
    document.getElementById('quick-add-actions').style.display = 'flex';
  });
  document.getElementById('quick-add-input').addEventListener('keydown', (ke) => {
    if (ke.key === 'Enter') {
      ke.preventDefault();
      const actions = document.getElementById('quick-add-actions');
      if (actions.style.display === 'none') { actions.style.display = 'flex'; }
      else { addTodo(); }
    }
    if (ke.key === 'Escape') resetQuickAdd();
  });
  document.getElementById('btn-add').addEventListener('click', addTodo);
  document.getElementById('btn-cancel-add').addEventListener('click', resetQuickAdd);

  // Sidebar
  document.querySelectorAll('.nav-item').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentView = link.dataset.view;
      document.querySelectorAll('.nav-item').forEach((l) => l.classList.remove('active'));
      link.classList.add('active');
      renderTaskList();
    });
  });

  renderTaskList();
});
