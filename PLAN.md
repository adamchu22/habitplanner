# PLAN.md — Habit Planner: New Tab Chrome Extension

> Status: **DRAFT — final confirms pending.** Do not execute yet.
> Companion file: [DESIGN.md](DESIGN.md) — the locked visual spec.

## Context

Every new tab should be a daily reminder surface: today's habits with visible streaks,
plus a Monday/Notion-style nested task list with notes, checklists, and progress.
Personal use in Brave (Chromium) on macOS. Phone sync explicitly deferred.

## Decisions so far

- Process: grilling → single plan → Plannotator review → separate design-agent pass → build
- Storage: `chrome.storage.local`, one JSON document (+ separate `archive` key)
- Task model: Item (ticket) → optional Sub-items. Each Item/Sub-item has: title, done
  state, optional due date, a notes/comment area containing checklist entries, and a
  progress circle showing % of its checkboxes complete
- Done items get archived; archive lives in a separate key so it doesn't clutter the
  active view; future file-offload of old archives is possible because storage is plain JSON
- Habits: daily checkbox habits. Missed day → streak resets to 0. Retroactive editing
  of the past **14 days** via per-habit dot grid. Show current streak, best streak, and
  14-day success rate
- Layout: two columns, user-resizable divider; habits column narrower than todos column;
  items collapse/expand
- Stack: vanilla HTML/CSS/JS, Manifest V3, zero dependencies, no build step
- Visual quality is a hard requirement (looked at every day) → dedicated design pass below

## Approach

### Architecture

MV3 extension whose only surface is the new tab page:

```
habitplanner/
  manifest.json     # MV3, chrome_url_overrides.newtab
  newtab.html       # shell: <aside id="habits"> | <div class="divider"> | <main id="todos">
  newtab.css        # single stylesheet incl. design tokens from design pass
  newtab.js         # all logic (~400 lines expected)
  icons/icon16.png icon48.png icon128.png
```

No service worker needed — new tab pages don't require background scripts. No permissions
beyond `storage`.

### Data model (`chrome.storage.local`)

Single document under key `"state"`:

```js
{
  version: 1,
  habits: [{
    id, name,
    // date (YYYY-MM-DD local) -> done bool; sparse; source of truth for streaks
    history: { "2026-02-10": true }
  }],
  items: [{
    id, title, due: "2026-02-14"|null, done: false, collapsed: false,
    note: "",                       // the "comment"
    checklist: [{ id, text, done }],
    subitems: [{
      id, title, due, done, note, checklist: [{ id, text, done }]
    }]                              // exactly one level of nesting
  }]
}
```

Separate key `"archive"`: array of finished items, same shape as `items`.
Export/import buttons dump/load both keys as one JSON file (future phone-sync path).

Key lazy calls:
- **Streaks are computed at render time** from `history`, never stored — stored counters
  rot; derived values can't drift.
- Dates are local-time YYYY-MM-DD strings via a small `today()` helper — no Date-library
  timezone traps.
- Rendering = one `render()` that rebuilds DOM from state after every mutation +
  debounced save. No framework, no virtual DOM, no diffing.

### Behavior spec

**Habits column**
- Row per habit: name · today's checkbox · 🔥 current streak · best streak · 14-day dot
  grid (each dot clickable to toggle that past day) · % complete over 14 days
- Add habit (inline input), rename/delete via hover controls
- Streak logic: consecutive days ending today-or-yesterday with done=true; any missed day
  resets; days before habit creation don't count against it

**Todos column**
- Add item (title input at top; optional due date via native `<input type="date">`)
- Item header: collapse chevron · progress ring (% checklist done) · title · due badge
  (overdue highlighted) · done checkbox · archive button
- Expanded item: editable note area + its checklist entries (add/toggle/delete) +
  sub-items
- Sub-item: same anatomy minus its own sub-items (nesting capped at 2 levels)
- Checking an item marks it done without auto-checking children; "n of m" comes from
  checklist math only
- Archive section: collapsed by default at column bottom; restore/unarchive supported
- Divider between columns: draggable, position persisted in state

## Design pass (done — see DESIGN.md)

Design agent returned a full system, saved as **DESIGN.md** (the visual spec for the
build): warm paper/quiet-ink direction, terracotta accent, dark-first with manual toggle,
dot-based temporal visual language, five CSS-only micro-interactions, AA contrast
verified. Tokens drop into `newtab.css` custom properties unchanged.

## Reuse

Nothing — greenfield repo. Stdlib only: `<input type="date">`, `<details>` not used
(custom collapse for animation-free simplicity is fine either way), CSS custom properties.

## Steps

- [x] 1. Design pass → design tokens + visual spec locked
- [x] 2. `manifest.json` + static HTML/CSS shell with hardcoded sample content
- [x] 3. State layer: load/save `chrome.storage.local`, migration-safe `version` field
- [x] 4. Habits: CRUD, today toggle, streak/best/% computation, 14-day grid w/ retro edits
- [x] 5. Todos: item/subitem CRUD, collapse, notes, checklists, progress rings, due dates
- [x] 6. Archive flow + export/import buttons
- [x] 7. Resizable divider (persisted)
- [x] 8. Self-check: `assert`-based test file for streak math & progress % (pure functions)

## Verification

1. `chrome://extensions` → load unpacked → open new tab
2. Habit flows: add habit, check today, backfill yesterday via dot grid, verify streak
   increments; skip a day, verify reset; verify best-streak retention
3. Todo flows: add item + subitems + checklist entries; verify ring %; collapse/expand;
   due-date overdue style; archive + restore
4. Persistence: reload browser, state intact; resize divider, reload, size retained
5. Run `node test.js` (streak/progress asserts) passes
