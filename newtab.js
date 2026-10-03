'use strict';
/* Habit Planner — new tab page. Vanilla JS, zero deps.
   Storage: chrome.storage.local, keys "state" + "archive".
   All open tabs stay in sync via chrome.storage.onChanged. */

// ---------- pure helpers (unit-tested via test.js) ----------
const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());

function shiftDate(s, delta) {
  const [y, m, d] = s.split('-').map(Number);
  return dstr(new Date(y, m - 1, d + delta));
}
function lastNDays(n) {
  const t = today(), out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDate(t, -i));
  return out;
}
/* Consecutive done days ending today (or yesterday if today not yet done). */
function currentStreak(hist) {
  let n = 0, d = today();
  if (!hist[d]) d = shiftDate(d, -1);
  while (hist[d]) { n++; d = shiftDate(d, -1); }
  return n;
}
function bestStreak(hist) {
  const ds = Object.keys(hist).filter(k => hist[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const d of ds) {
    run = (prev && shiftDate(prev, 1) === d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}
function success14(hist) { return lastNDays(14).filter(d => hist[d]).length; }
function progressPct(cl) {
  return cl.length ? Math.round(100 * cl.filter(c => c.done).length / cl.length) : null;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2);

// ---------- state ----------
let state = null, archive = [], suppressSync = false, pendingFocus = null, pendingCheck = null;
const $ = sel => document.querySelector(sel);

function defaultState() {
  return { version: 1, theme: '', dividerPct: 35, tdtPct: 26, notesPct: 30, tdtDate: '', tdtLog: [], habits: [], items: [], notes: [], tdt: [] };
}
/* Migration-safe defaults on every node. */
function ensureNode(n, isTop) {
  n.title ??= ''; n.note ??= ''; n.due ??= null; n.done ??= false;
  n.collapsed ??= false; n.color ??= null;
  n.checklist ??= [];
  for (const c of n.checklist) { c.text ??= ''; c.done ??= false; }
  if (isTop) { n.subitems ??= []; for (const s of n.subitems) ensureNode(s, false); }
  return n;
}

/* Task import: full backup ({state:{items},archive}) replaces everything;
   {items:[...]} or a bare array appends tasks. Returns {backup}|{items}|null. */
function parseTaskImport(data) {
  const norm = list => list.map(n => ensureNode({ ...n, id: n.id || uid() }, true));
  if (Array.isArray(data)) return { items: norm(data) };
  if (Array.isArray(data?.items) && !data.state) return { items: norm(data.items) };
  if (data?.state && Array.isArray(data.state.items)) return { backup: data };
  return null;
}

async function load() {
  const o = await chrome.storage.local.get(['state', 'archive']);
  state = Object.assign(defaultState(), o.state || {});
  for (const h of state.habits) { h.history ??= {}; h.color ??= null; h.collapsed ??= false; }
  for (const it of state.items) ensureNode(it, true);
  archive = (o.archive || []).map(a => ensureNode(a, true));
}

function save() {
  suppressSync = true;
  chrome.storage.local.set({ state, archive });
  setTimeout(() => { suppressSync = false; }, 250);
}
async function refreshExternal() {
  const o = await chrome.storage.local.get(['state', 'archive']);
  if (o.state) state = Object.assign(defaultState(), o.state);
  if (o.archive) archive = o.archive;
  render();
}

// ---------- lookups ----------
const findHabit = id => state.habits.find(h => h.id === id);
const findItem = id => state.items.find(i => i.id === id);
function findAll(id) {
  for (const it of state.items.concat(archive)) {
    if (it.id === id) return it;
    for (const s of it.subitems || []) if (s.id === id) return s;
  }
  return null;
}
function findCheck(id) {
  for (const it of state.items.concat(archive))
    for (const owner of [it, ...(it.subitems || [])]) {
      const c = owner.checklist.find(c => c.id === id);
      if (c) return c;
    }
  return null;
}

// ---------- templates ----------
const FLAME = '<svg class="flame" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67z"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>';

function ringSVG(pct, small) {
  if (pct === null) return '';
  const C = +(2 * Math.PI * 11).toFixed(1);
  return `<svg class="ring${small ? ' ring-sm' : ''}" width="28" height="28" viewBox="0 0 28 28"
    role="img" aria-label="${pct}% complete">
    <circle cx="14" cy="14" r="11" class="ring-track"/>
    <circle cx="14" cy="14" r="11" class="ring-fill"
      stroke-dasharray="${C}" stroke-dashoffset="${+(C * (1 - pct / 100)).toFixed(1)}"/>
  </svg>`;
}

function dueBadge(due) {
  if (!due) return '';
  const ms = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const diff = Math.round((ms(due) - ms(today())) / 864e5);
  const cls = diff < 0 ? 'overdue' : diff <= 2 ? 'near' : '';
  const label = ms(due).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `<span class="due ${cls}">${diff < 0 ? '⚠ ' : ''}${label}</span>`;
}

function habitHTML(h) {
  const t = today(), cur = currentStreak(h.history), best = bestStreak(h.history);
  return `<div class="habit card${h.collapsed ? '' : ' open'}" data-card="${h.id}" draggable="true"${h.color ? ` style="--tint:${esc(h.color)}"` : ''}>
    <div class="habit-top">
      <span class="grip" aria-hidden="true" title="Drag to reorder"></span>
      <input type="checkbox" class="chk" data-act="habit-today" data-id="${h.id}"
        ${h.history[t] ? 'checked' : ''} aria-label="Mark ${esc(h.name)} done today">
      <input class="line-input habit-name" data-act="habit-name" data-id="${h.id}"
        value="${esc(h.name)}" placeholder="Habit name" aria-label="Habit name">
      <span class="chip${cur ? '' : ' zero'}" title="Current streak">${FLAME}${cur}</span>
      <span class="best" title="Best streak">best ${best}</span>
      <button class="swatch${h.color ? '' : ' empty'}" data-act="color" data-id="${h.id}"
        ${h.color ? `style="--sw:${esc(h.color)}"` : ''} aria-label="Habit color" title="Habit color"></button>
      <button class="chev chev-sm${h.collapsed ? '' : ' open'}" data-act="collapse" data-id="${h.id}"
        aria-expanded="${!h.collapsed}" aria-label="Show habit details">▸</button>
      <button class="icon-btn del" data-act="del-habit" data-id="${h.id}"
        aria-label="Delete habit">×</button>
    </div>
  </div>`;
}

const hasTdt = id => state.tdt.some(t => t.ref === id);
/* TDT completion syncs both ways with its linked item */
function tdtLabel(t) {
  const src = t.ref ? (findAll(t.ref) || findCheck(t.ref)) : null;
  return t.ref ? (src ? (src.title || src.text) || '(untitled)' : '(removed)') : t.text;
}
/* "Task › Sub-task" context for a checklist item */
function checkContext(st, cid) {
  for (const it of st.items.concat(st.archive || [])) {
    for (const owner of [it, ...(it.subitems || [])]) {
      if (owner.checklist.some(c => c.id === cid)) {
        const t = it.title || '(untitled)';
        return owner.id === it.id ? t : `${t} › ${owner.title || '(untitled)'}`;
      }
    }
  }
  return '';
}
function logToday(st, label, done, context) {
  let day = st.tdtLog.find(d => d.date === today());
  if (!day) { day = { date: today(), items: [] }; st.tdtLog.unshift(day); }
  day.items.push({ label, done, context });
}
/* done = cleared off today's list, recorded in the log */
function completeTdt(t) {
  state.tdt = state.tdt.filter(x => x.id !== t.id);
  logToday(state, tdtLabel(t), true, t.ref ? checkContext(state, t.ref) : '');
  /* linked checklist item is now logged — clear it so the boot sweep doesn't re-log it */
  if (t.ref) {
    const owner = ownerOfCheck(t.ref);
    if (owner) owner.checklist = owner.checklist.filter(c => c.id !== t.ref);
  }
}
function syncTdt(ref, v) {
  for (const t of state.tdt) if (t.ref === ref) {
    if (v) completeTdt(t); else t.done = false;
  }
}

/* new day: snapshot leftover TDT entries into the log, start fresh */
function rolloverTdt() {
  if (state.tdtDate && state.tdtDate !== today() && state.tdt.length) {
    state.tdtLog.unshift({
      date: state.tdtDate,
      items: state.tdt.map(t => ({ label: tdtLabel(t), done: !!t.done, context: t.ref ? checkContext(state, t.ref) : '' }))
    });
    state.tdt = [];
  }
  state.tdtDate = today();
  save();
}

/* boot: completed checklist items → Done Log, cleared from the task */
function sweepDoneChecks(st) {
  for (const it of st.items) {
    for (const owner of [it, ...(it.subitems || [])]) {
      const done = owner.checklist.filter(c => c.done);
      if (!done.length) continue;
      for (const c of done) logToday(st, c.text, true, checkContext(st, c.id));
      owner.checklist = owner.checklist.filter(c => !c.done);
    }
  }
}
/* boot: drop completed log entries older than 30 days (ISO dates compare lexically) */
function pruneLog(st) {
  const cutoff = shiftDate(today(), -30);
  st.tdtLog = st.tdtLog
    .map(day => ({ ...day, items: day.items.filter(i => !i.done || day.date >= cutoff) }))
    .filter(day => day.items.length);
}
function tdtHTML(t) {
  return `<div class="tdt-row${t.done ? ' done' : ''}">
    <input type="checkbox" class="chk chk-sm" data-act="tdt-done" data-id="${t.id}"
      ${t.done ? 'checked' : ''} aria-label="Mark ${esc(tdtLabel(t))} done today">
    <span class="tdt-label">${esc(tdtLabel(t))}</span>
    <button class="icon-btn del" data-act="tdt-del" data-id="${t.id}"
      aria-label="Remove from To Do Today">×</button>
  </div>`;
}

function noteHTML(n) {
  return `<div class="note-row">
    <span class="bullet" aria-hidden="true">•</span>
    <input class="line-input note-text" data-act="note-text" data-id="${n.id}"
      value="${esc(n.text)}" placeholder="Note" aria-label="Note">
    <button class="icon-btn del" data-act="del-note" data-id="${n.id}"
      aria-label="Delete note">×</button>
  </div>`;
}

function checklistHTML(owner) {
  const rows = owner.checklist.map(c => `<li draggable="true" data-check="${c.id}">
    <span class="grip grip-sm" aria-hidden="true" title="Drag to reorder"></span>
    <input type="checkbox" class="chk chk-sm" data-act="check-toggle" data-id="${c.id}"
      ${c.done ? 'checked' : ''} aria-label="Toggle checklist item">
    <button class="tdt-btn tdt-sm${hasTdt(c.id) ? ' on' : ''}" data-act="tdt" data-id="${c.id}"
      title="Send to To Do Today">TDT</button>
    <input class="line-input check-text" id="f-${c.id}" data-act="check-text" data-id="${c.id}"
      value="${esc(c.text)}" placeholder="Checklist item">
    <button class="icon-btn del" data-act="check-del" data-id="${c.id}"
      aria-label="Delete checklist item">×</button>
  </li>`).join('');
  return `<ul class="checks">${rows}
    <li class="check-add"><input class="check-add-input"
      data-owner="${owner.id}" placeholder="New checklist item…"
      aria-label="New checklist item"></li>
  </ul>`;
}

function subHTML(s) {
  return `<div class="subtask ${s.done ? 'done' : ''}">
    <div class="task-row">
      <button class="chev${s.collapsed ? '' : ' open'}" data-act="collapse" data-id="${s.id}"
        aria-expanded="${!s.collapsed}" aria-label="Expand or collapse sub-task">▸</button>
      <input type="checkbox" class="chk chk-sm" data-act="toggle-done" data-id="${s.id}"
        ${s.done ? 'checked' : ''} aria-label="Mark sub-task done">
      ${ringSVG(progressPct(s.checklist), true)}
      <button class="tdt-btn${hasTdt(s.id) ? ' on' : ''}" data-act="tdt" data-id="${s.id}"
        title="Send to To Do Today">TDT</button>
      <input class="line-input sub-title" id="f-${s.id}" data-act="title" data-id="${s.id}"
        value="${esc(s.title)}" placeholder="Sub-task title">
      <button class="cal-btn" data-act="cal" aria-label="Set due date" title="Due date">${CAL}</button>
      ${dueBadge(s.due)}
      <input type="date" class="due-input cal-hidden" data-owner="${s.id}" value="${s.due || ''}"
        aria-label="Sub-task due date" tabindex="-1">
      <textarea class="note note-inline" rows="1" data-owner="${s.id}"
        placeholder="Notes…" aria-label="Sub-task notes">${esc(s.note)}</textarea>
      <button class="txt-btn" data-act="del-sub" data-id="${s.id}">delete</button>
    </div>
    <div class="collapse${s.collapsed ? '' : ' open'}"><div class="collapse-in">
    ${checklistHTML(s)}
    </div></div>
  </div>`;
}

function itemHTML(it) {
  const m = it.checklist.length, n = it.checklist.filter(c => c.done).length;
  const body = `
    <div class="collapse${it.collapsed ? '' : ' open'}"><div class="collapse-in">
    <div class="task-body">
      ${checklistHTML(it)}
      <div class="subs">${it.subitems.map(subHTML).join('')}</div>
    </div>
    </div></div>`;
  return `<section class="task card ${it.done ? 'is-done' : ''}" data-card="${it.id}" draggable="true"${it.color ? ` style="--tint:${esc(it.color)}"` : ''}>
    <div class="task-row">
      <span class="grip" aria-hidden="true" title="Drag to reorder"></span>
      <button class="chev${it.collapsed ? '' : ' open'}" data-act="collapse" data-id="${it.id}"
        aria-expanded="${!it.collapsed}" aria-label="Expand or collapse task">▸</button>
      ${ringSVG(progressPct(it.checklist))}
      <input type="checkbox" class="chk" data-act="toggle-done" data-id="${it.id}"
        ${it.done ? 'checked' : ''} aria-label="Mark task done">
      <button class="swatch${it.color ? '' : ' empty'}" data-act="color" data-id="${it.id}"
        ${it.color ? `style="--sw:${esc(it.color)}"` : ''} aria-label="Task color" title="Task color"></button>
      <button class="tdt-btn${hasTdt(it.id) ? ' on' : ''}" data-act="tdt" data-id="${it.id}"
        title="Send to To Do Today">TDT</button>
      <input class="line-input task-title" id="f-${it.id}" data-act="title" data-id="${it.id}"
        value="${esc(it.title)}" placeholder="Task title">
      <button class="cal-btn" data-act="cal" aria-label="Set due date" title="Due date">${CAL}</button>
      ${dueBadge(it.due)}
      <input type="date" class="due-input cal-hidden" data-owner="${it.id}" value="${it.due || ''}"
        aria-label="Due date" tabindex="-1">
      <textarea class="note note-inline" rows="1" data-owner="${it.id}"
        placeholder="Notes…" aria-label="Task notes">${esc(it.note)}</textarea>
      <span class="count">${n}/${m}</span>
      <button class="txt-btn" data-act="add-sub" data-id="${it.id}">+ sub</button>
      <button class="txt-btn" data-act="archive" data-id="${it.id}">archive</button>
      <button class="icon-btn del" data-act="del-item" data-id="${it.id}"
        aria-label="Delete task">×</button>
    </div>
    ${body}
  </section>`;
}

function renderArchList() {
  $('#arch-list').innerHTML = archive.map(a => `
    <div class="task card archived">
      <div class="task-row">
        <span class="arch-title">${esc(a.title) || '(untitled)'}</span>
        <button class="txt-btn" data-act="restore" data-id="${a.id}">restore</button>
        <button class="icon-btn del" data-act="purge" data-id="${a.id}"
          aria-label="Permanently delete">×</button>
      </div>
    </div>`).join('');
}

function renderLog() {
  const el = $('#log-list');
  if (!el) return;
  el.innerHTML = state.tdtLog.length ? state.tdtLog.map(day => `
    <div class="log-day">
      <h3 class="log-date">${esc(day.date)}</h3>
      ${day.items.map(i => `<div class="log-item${i.done ? ' done' : ''}">${i.done ? '✓' : '·'} ${esc(i.label)}${i.context ? ` <span class="log-ctx">${esc(i.context)}</span>` : ''}</div>`).join('')}
    </div>`).join('')
    : '<p class="empty">Finished days will appear here.</p>';
}

// ---------- render ----------
function render() {
  $('#habits').innerHTML = state.habits.length
    ? state.habits.map(habitHTML).join('')
    : '<p class="empty">No habits yet — add one below.</p>';
  const active = state.items.filter(i => !i.done), doneItems = state.items.filter(i => i.done);
  $('#items').innerHTML = active.length
    ? active.map(itemHTML).join('')
    : `<p class="empty">${doneItems.length ? 'All clear.' : 'No tasks. Add your first above.'}</p>`;
  const doneSec = $('#done-sec'), doneCount = $('#done-count'), doneList = $('#done-list');
  if (doneSec) doneSec.hidden = !doneItems.length && !state.tdtLog.length;
  if (doneCount) doneCount.textContent = doneItems.length;
  if (doneList) doneList.innerHTML = doneItems.map(it => `
    <div class="task card done-card">
      <div class="task-row">
        <input type="checkbox" class="chk" data-act="toggle-done" data-id="${it.id}" checked
          aria-label="Restore ${esc(it.title) || 'task'}">
        <span class="arch-title">${esc(it.title) || '(untitled)'}</span>
        ${dueBadge(it.due)}
      </div>
    </div>`).join('');
  $('#notes').innerHTML = state.notes.length
    ? state.notes.map(noteHTML).join('')
    : '<p class="empty">Quotes, bullets, reminders…</p>';
  const tdtList = $('#tdt');
  if (tdtList) tdtList.innerHTML = state.tdt.length
    ? state.tdt.map(tdtHTML).join('')
    : '<p class="empty">Tap TDT on any item, or add free below.</p>';
  $('#arch-count').textContent = archive.length;
  renderArchList();
  renderLog();
  $('#greeting').textContent =
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  applyTheme();
  $('#habits-col').style.width = state.dividerPct + '%';
  const tdtSec = $('#tdt-sec'), notesSec = $('#notes-sec');
  if (tdtSec) tdtSec.style.height = state.tdtPct + '%';
  if (notesSec) notesSec.style.height = state.notesPct + '%';
  if (pendingFocus) {
    const el = document.getElementById('f-' + pendingFocus);
    if (el) { el.focus(); el.select?.(); }
    pendingFocus = null;
  }
  if (pendingCheck) {
    document.querySelector(`.check-add-input[data-owner="${pendingCheck}"]`)?.focus();
    pendingCheck = null;
  }
}

// ---------- theme ----------
const effectiveTheme = () => state.theme ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
function applyTheme() { document.documentElement.dataset.theme = effectiveTheme(); }

// ---------- divider ----------
let dragging = false;
function setPct(p) {
  state.dividerPct = Math.min(55, Math.max(15, p));
  $('#habits-col').style.width = state.dividerPct + '%';
}
function initDivider() {
  const app = $('#app'), div = $('#divider');
  if (!div) return;
  div.addEventListener('mousedown', () => { dragging = true; div.classList.add('dragging'); });
  window.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; div.classList.remove('dragging'); save(); }
  });
  window.addEventListener('mousemove', e => {
    if (dragging) setPct(e.clientX / app.clientWidth * 100);
  });
  div.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { setPct(state.dividerPct - 2); save(); }
    if (e.key === 'ArrowRight') { setPct(state.dividerPct + 2); save(); }
  });
}

// ---------- events (browser only) ----------
function initUI() {
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  const palEl = $('#palette'), dpEl = $('#daypick');
  if (palEl && !palEl.hidden && !e.target.closest('#palette') && !e.target.closest('.swatch')) closePalette();
  if (dpEl && !dpEl.hidden && !e.target.closest('#daypick') && !e.target.closest('[data-act="habit-today"]')) closeDaypick();
  if (!el || el.tagName === 'INPUT') return;
  const { act, id, date } = el.dataset;
  switch (act) {
    case 'color': openPalette(el); break;
    case 'pick':
    case 'pick-none': {
      const n = findHabit(palTarget) || findAll(palTarget);
      if (n) { n.color = act === 'pick' ? el.dataset.color : null; save(); render(); }
      closePalette();
      break;
    }
    case 'cal': {
      const inp = el.closest('.task-row')?.querySelector('.due-input');
      if (inp) (inp.showPicker ? inp.showPicker() : inp.click());
      break;
    }
    case 'collapse': {
      const n = findHabit(id) || findAll(id); if (!n) break; n.collapsed = !n.collapsed;
      const panel = el.closest('.task, .subtask, .habit')?.querySelector(':scope > .collapse');
      if (panel) {
        panel.classList.toggle('open', !n.collapsed); /* CSS sweeps 0fr→1fr */
        el.classList.toggle('open', !n.collapsed);
        el.setAttribute('aria-expanded', String(!n.collapsed));
      }
      save(); break;
    }
    case 'add-sub': {
      const p = findItem(id);
      const s = { id: uid(), title: '', due: null, done: false, collapsed: false, note: '', checklist: [] };
      p.subitems.push(s); pendingFocus = s.id; save(); render(); break;
    }
    case 'archive': {
      if (!confirm('Archive this task?')) break;
      const i = state.items.findIndex(x => x.id === id);
      if (i > -1) archive.unshift(state.items.splice(i, 1)[0]);
      save(); render(); break;
    }
    case 'restore': {
      const i = archive.findIndex(x => x.id === id);
      if (i > -1) state.items.push(archive.splice(i, 1)[0]);
      save(); render(); break;
    }
    case 'purge':
      if (confirm('Permanently delete this archived task?')) {
        archive = archive.filter(x => x.id !== id);
        save(); render();
      }
      break;
    case 'tdt': {
      const i = state.tdt.findIndex(t => t.ref === id);
      if (i > -1) state.tdt.splice(i, 1);
      else state.tdt.push({ id: uid(), ref: id, done: false });
      save(); render(); break;
    }
    case 'tdt-del':
      state.tdt = state.tdt.filter(t => t.id !== id);
      save(); render(); break;
    case 'day-today':
    case 'day-yest': {
      const h = findHabit(daypickTarget);
      if (h) h.history[act === 'day-today' ? today() : shiftDate(today(), -1)] = true;
      closeDaypick(); save(); render(); break;
    }
    case 'del-note':
      state.notes = state.notes.filter(n => n.id !== id);
      save(); render();
      break;
    case 'del-habit':
      if (confirm('Delete this habit and its history?')) {
        state.habits = state.habits.filter(h => h.id !== id);
        save(); render();
      }
      break;
    case 'del-item':
      if (confirm('Delete this task and everything in it?')) {
        state.items = state.items.filter(x => x.id !== id);
        save(); render();
      }
      break;
    case 'del-sub': {
      for (const it of state.items) {
        const i = (it.subitems || []).findIndex(s => s.id === id);
        if (i > -1) { it.subitems.splice(i, 1); break; }
      }
      save(); render(); break;
    }
    case 'check-del': {
      outer: for (const it of state.items.concat(archive))
        for (const owner of [it, ...(it.subitems || [])]) {
          const i = owner.checklist.findIndex(c => c.id === id);
          if (i > -1) { owner.checklist.splice(i, 1); break outer; }
        }
      save(); render(); break;
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-act]');
  if (el && el.type === 'checkbox') {
    const { act, id } = el.dataset;
    if (act === 'habit-today') {
      const h = findHabit(id);
      if (el.checked) { el.checked = false; openDaypick(el, id); return; } /* ask today/yesterday */
      delete h.history[today()];
    } else if (act === 'toggle-done') {
      findAll(id).done = el.checked; syncTdt(id, el.checked);
    } else if (act === 'check-toggle') {
      findCheck(id).done = el.checked; syncTdt(id, el.checked);
    } else if (act === 'tdt-done') {
      const t = state.tdt.find(x => x.id === id);
      if (t) {
        if (el.checked) {
          if (t.ref) { const n = findAll(t.ref) || findCheck(t.ref); if (n) n.done = true; }
          completeTdt(t);
        } else t.done = false;
      }
    } else return;
    save(); render();
    return;
  }
  if (el?.classList.contains('due-input')) {
    const n = findAll(el.dataset.owner);
    n.due = el.value || null;
    save(); render();
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'new-title' || el.id === 'new-habit') return;
  const act = el.dataset.act;
  if (act === 'title') { findAll(el.dataset.id).title = el.value; save(); }
  else if (act === 'habit-name') { findHabit(el.dataset.id).name = el.value; save(); }
  else if (act === 'check-text') { findCheck(el.dataset.id).text = el.value; save(); }
  else if (act === 'note-text') { state.notes.find(n => n.id === el.dataset.id).text = el.value; save(); }
  else if (el.classList.contains('note')) { findAll(el.dataset.owner).note = el.value; save(); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closePalette(); closeDaypick(); }
  /* /Ctrl+Enter on a checklist check or its text jumps to the new-item box */
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) &&
      e.target.matches('.chk[data-act="check-toggle"], .check-text')) {
    e.preventDefault();
    e.target.closest('.checks')?.querySelector('.check-add-input')?.focus();
    return;
  }
  if (e.key !== 'Enter') return;
  if (e.target.id === 'new-habit') {
    const name = e.target.value.trim();
    if (name) {
      state.habits.push({ id: uid(), name, history: {} });
      e.target.value = ''; save(); render();
    }
  } else if (e.target.id === 'new-title') {
    addItem();
  } else if (e.target.id === 'new-tdt') {
    const text = e.target.value.trim();
    if (text) {
      state.tdt.push({ id: uid(), text, done: false });
      e.target.value = ''; save(); render();
    }
  } else if (e.target.id === 'new-note') {
    const text = e.target.value.trim();
    if (text) {
      state.notes.push({ id: uid(), text });
      e.target.value = ''; save(); render();
    }
  } else if (e.target.classList.contains('check-add-input')) {
    const owner = findAll(e.target.dataset.owner);
    const text = e.target.value.trim();
    if (text) {
      const c = { id: uid(), text, done: false };
      owner.checklist.push(c);
      pendingCheck = owner.id; save(); render();
    }
  }
});

function addItem() {
  const t = $('#new-title').value.trim();
  if (!t) return;
  state.items.unshift({
    id: uid(), title: t, due: $('#new-due').value || null,
    done: false, collapsed: false, note: '', checklist: [], subitems: []
  });
  $('#new-title').value = ''; $('#new-due').value = '';
  save(); render();
}

// ---------- header actions ----------
$('#theme-btn').addEventListener('click', () => {
  state.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
  save(); applyTheme();
});
$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ state, archive }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'),
    { href: URL.createObjectURL(blob), download: `habitplanner-backup-${today()}.json` });
  a.click(); URL.revokeObjectURL(a.href);
});
$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const parsed = parseTaskImport(JSON.parse(await f.text()));
    if (!parsed) throw new Error('bad shape');
    if (parsed.backup) {
      state = Object.assign(defaultState(), parsed.backup.state);
      archive = parsed.backup.archive || [];
    } else {
      state.items.unshift(...parsed.items);
    }
    save(); render();
  } catch { alert('Not a valid HabitPlanner file.'); }
  e.target.value = '';
});
$('#log-btn')?.addEventListener('click', () => {
  const sec = $('#done-sec');
  if (sec.hidden) sec.hidden = false;
  if ($('#log-list').hidden) $('#log-toggle').click();
  $('#log-sec').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
$('#arch-toggle').addEventListener('click', () => {
  const list = $('#arch-list');
  const open = list.hidden;
  list.hidden = !open;
  $('#arch-toggle').setAttribute('aria-expanded', String(open));
  $('#arch-toggle').firstChild.textContent = open ? '▾ Archive (' : '▸ Archive (';
  if (open) renderArchList();
});
$('#done-toggle')?.addEventListener('click', () => {
  const list = $('#done-list');
  const open = list.hidden;
  list.hidden = !open;
  $('#done-toggle').setAttribute('aria-expanded', String(open));
  $('#done-toggle').firstChild.textContent = open ? '▾ Done (' : '▸ Done (';
});
$('#log-toggle')?.addEventListener('click', () => {
  const list = $('#log-list');
  const open = list.hidden;
  list.hidden = !open;
  $('#log-toggle').setAttribute('aria-expanded', String(open));
  $('#log-toggle').firstChild.textContent = open ? '▾ Done Log' : '▸ Done Log';
  if (open) renderLog();
});
}

// ---------- horizontal splitters in habits column ----------
function initSplit(divSel, secSel, key) {
  const col = $('#habits-col'), div = $(divSel), sec = $(secSel);
  if (!div || !sec) return; /* stale html mid-reload: skip, next load picks up */
  let drag = false;
  const set = p => { state[key] = Math.min(70, Math.max(12, p)); sec.style.height = state[key] + '%'; };
  div.addEventListener('mousedown', () => { drag = true; div.classList.add('dragging'); });
  window.addEventListener('mouseup', () => { if (drag) { drag = false; div.classList.remove('dragging'); save(); } });
  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const r = col.getBoundingClientRect(), s = sec.getBoundingClientRect();
    set((s.bottom - e.clientY) / r.height * 100);
  });
  div.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') { set(state[key] + 3); save(); }
    if (e.key === 'ArrowDown') { set(state[key] - 3); save(); }
  });
}

// ---------- color palette popover ----------
const PALETTE = ['#ffb454', '#ff6a5c', '#ffd9a0', '#7ee0a3', '#5cc8ff', '#b78cff', '#ff8fb3', '#9aa7b8',
  '#e8c547', '#a3e05c', '#3ddad0', '#6f7bff', '#d65cff', '#ff4fd8', '#e07a3f', '#8a9a4b', '#b08968', '#f2f2f2'];
let palTarget = null;
function buildPalette() {
  const pal = $('#palette');
  if (pal) pal.innerHTML = PALETTE.map(c =>
    `<button class="pal-dot" data-act="pick" data-color="${c}" style="--c:${c};background:${c}"
      aria-label="Set color ${c}" title="${c}"></button>`).join('') +
    `<button class="pal-dot pal-none" data-act="pick-none" aria-label="Clear color" title="Clear">×</button>`;
}
function closePalette() { palTarget = null; const p = $('#palette'); if (p) p.hidden = true; }

/* today / yesterday picker for habit check-off */
let daypickTarget = null;
function closeDaypick() { daypickTarget = null; const d = $('#daypick'); if (d) d.hidden = true; }
function openDaypick(el, id) {
  daypickTarget = id;
  const dp = $('#daypick');
  dp.hidden = false;
  const r = el.getBoundingClientRect();
  dp.style.left = Math.min(Math.max(8, r.left), innerWidth - dp.offsetWidth - 8) + 'px';
  dp.style.top = Math.min(r.bottom + 8, innerHeight - dp.offsetHeight - 8) + 'px';
}
function openPalette(sw) {
  const pal = $('#palette');
  if (palTarget === sw.dataset.id && !pal.hidden) { closePalette(); return; }
  palTarget = sw.dataset.id;
  pal.hidden = false;
  const r = sw.getBoundingClientRect();
  pal.style.left = Math.min(Math.max(8, r.left), innerWidth - pal.offsetWidth - 8) + 'px';
  pal.style.top = Math.min(r.bottom + 8, innerHeight - pal.offsetHeight - 8) + 'px';
}

// ---------- drag & drop reorder (habits & tasks) ----------
let dragId = null, dragCheckId = null, dragEl = null, dndOk = false;
function moveIn(arr, fromId, toId, before) {
  const from = arr.findIndex(x => x.id === fromId);
  if (from < 0) return false;
  const [item] = arr.splice(from, 1);
  const to = arr.findIndex(x => x.id === toId);
  if (to < 0) { arr.push(item); return true; }
  arr.splice(before ? to : to + 1, 0, item);
  return true;
}
const cardOf = el => el.closest('#habits .card[data-card], #items .card[data-card]');
/* card under the pointer; falls back to "after the last card" when over empty list space */
function dropTarget(t) {
  let card = cardOf(t), before = null;
  if (card) {
    const r = card.getBoundingClientRect();
    before = t.clientY < r.top + r.height / 2;
  } else {
    card = t.closest('#habits, #items')?.querySelector('[data-card]:last-child');
    if (card) before = false;
  }
  return card && card.dataset.card !== dragId ? { card, before } : null;
}
function ownerOfCheck(id) {
  for (const it of state.items.concat(archive))
    for (const owner of [it, ...(it.subitems || [])])
      if (owner.checklist.some(c => c.id === id)) return owner;
  return null;
}
function checkTarget(t) {
  let li = t.closest('li[data-check]'), before = null;
  if (li) {
    const r = li.getBoundingClientRect();
    before = t.clientY < r.top + r.height / 2;
  } else {
    li = t.closest('.checks')?.querySelector('li[data-check]:last-child');
    if (li) before = false;
  }
  return li && li.dataset.check !== dragCheckId ? { li, before } : null;
}
function dragEnd() {
  dragId = null; dragCheckId = null; dragEl = null;
  document.querySelectorAll('.drag-src, .drop-before, .drop-after')
    .forEach(el => el.classList.remove('drag-src', 'drop-before', 'drop-after'));
}
/* state order follows whatever the drag left in the DOM */
const sortBy = (arr, ids) => arr.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
function commitOrder() {
  if (dragId) {
    sortBy(state.habits, [...$('#habits').querySelectorAll('[data-card]')].map(el => el.dataset.card));
    sortBy(state.items, [...$('#items').querySelectorAll('[data-card]')].map(el => el.dataset.card));
  }
  if (dragCheckId) {
    document.querySelectorAll('.checks').forEach(ul => {
      const ids = [...ul.querySelectorAll('[data-check]')].map(li => li.dataset.check);
      const owner = ids.length && ownerOfCheck(ids[0]);
      if (owner) sortBy(owner.checklist, ids);
    });
  }
}
function initDnD() {
  /* only start drags from card chrome, never from inputs/buttons */
  document.addEventListener('mousedown', e => {
    dndOk = !e.target.closest('input, textarea, button');
  });
  document.addEventListener('dragstart', e => {
    if (!dndOk) { e.preventDefault(); return; }
    const li = e.target.closest('li[data-check]');
    if (li) {
      dragCheckId = li.dataset.check; dragEl = li;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragCheckId);
      requestAnimationFrame(() => li.classList.add('drag-src'));
      return;
    }
    const card = cardOf(e.target);
    if (!card) { e.preventDefault(); return; }
    dragId = card.dataset.card; dragEl = card;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    requestAnimationFrame(() => card.classList.add('drag-src'));
  });
  /* live reorder: the dragged node itself slides through the list */
  document.addEventListener('dragover', e => {
    const dt = dragCheckId ? checkTarget(e.target) : dragId ? dropTarget(e.target) : null;
    if (!dt || !dragEl) return;
    const target = dt.li || dt.card;
    if (target.parentNode !== dragEl.parentNode) return;
    dragEl.parentNode.insertBefore(dragEl, dt.before ? target : target.nextSibling);
    e.preventDefault();
  });
  document.addEventListener('drop', e => {
    if (!dragId && !dragCheckId) return;
    e.preventDefault();
    commitOrder(); save(); dragEnd(); render();
  });
  document.addEventListener('dragend', () => { dragEnd(); render(); });
}

// ---------- boot ----------
async function boot() {
  await load();
  rolloverTdt();
  sweepDoneChecks(state);
  pruneLog(state);
  save();
  initUI();
  buildPalette();
  initDivider();
  initSplit('#tdt-divider', '#tdt-sec', 'tdtPct');
  initSplit('#notes-divider', '#notes-sec', 'notesPct');
  initDnD();
  render();
}
if (typeof chrome !== 'undefined' && chrome.storage?.local && typeof document !== 'undefined') {
  boot();
  // live sync across all open tabs/windows
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && !suppressSync) refreshExternal();
  });
}

// node test export
if (typeof module !== 'undefined') {
  module.exports = { dstr, today, shiftDate, lastNDays, currentStreak, bestStreak, success14, progressPct, moveIn, parseTaskImport, sweepDoneChecks, pruneLog };
}
