# HabitPlanner

A Chrome (Manifest V3) new tab extension that turns every new tab into a daily
dashboard: habit tracking with streaks plus a nested task/checklist tree.

## Features

- **Habits** — daily habit tracker with a dot-grid history and streak heat
- **Tasks** — Monday/Notion-style nested checklist tree with notes and progress rings
- **Dark-first theme** with manual light/dark toggle, persisted
- **Zero dependencies** — vanilla HTML/CSS/JS, no build step
- **Local-only** — data stays in `chrome.storage.local` on your machine

## Install

1. Open `brave://extensions` (or `chrome://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest (new tab override, `storage` permission) |
| `newtab.html` | Dashboard layout |
| `newtab.css` | Styles + design tokens (see `DESIGN.md`) |
| `newtab.js` | All logic: habits, tasks, storage, theme |
| `test.js` | Self-checks — run with `node test.js` |

## Docs

- [PLAN.md](PLAN.md) — architecture and decisions
- [DESIGN.md](DESIGN.md) — visual spec / design system

## License

[MIT](LICENSE)
