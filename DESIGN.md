# DESIGN.md — HabitPlanner Design System v1

Produced by the design-agent pass against the PLAN.md architecture. This file is the
visual spec the build implements; tokens go into `newtab.css` custom properties as-is.

## 1. Direction

**"Warm paper, quiet ink."** Soft warm-neutral canvas (never pure white/black), single
terracotta-amber accent doing all the emotional work — a well-kept paper journal, not an
app. **Signature idea:** everything temporal is a dot — habit history is a dot grid,
progress is a ring of dots (dashed stroke), streak heat lives in dot saturation.

**Theme: dark-first with manual toggle**, persisted (`data-theme` on `<html>`, CSS
defaults to dark; `@media (prefers-color-scheme: light)` only when no attribute set).
Rationale: new-tab page opened dozens of times daily, often at night; manual toggle means
the page doesn't shift under auto scheme changes. No web font — system stack, instant render.

## 2. Color tokens

```css
:root { /* DARK (default) */
  --bg:            hsl(30 12% 8%);
  --surface:       hsl(30 10% 12%);
  --surface-2:     hsl(30 9% 16%);
  --text:          hsl(35 15% 90%);
  --text-dim:      hsl(35 8% 58%);
  --text-faint:    hsl(35 6% 40%);   /* decorative only */
  --accent:        hsl(24 78% 62%);  /* terracotta #e08a52 */
  --accent-dim:    hsl(24 45% 32%);
  --success:       hsl(140 40% 55%);
  --danger:        hsl(4 65% 60%);
  --warn:          hsl(38 85% 60%);
  --border:        hsl(35 10% 20%);
  --border-strong: hsl(35 10% 28%);
  --dot-done:      var(--accent);
  --dot-missed:    hsl(35 8% 26%);
  --shadow:        0 1px 2px hsl(30 12% 4% / .4);
}

[data-theme="light"] {
  --bg:            hsl(38 33% 96%);  /* warm paper #f7f3ec */
  --surface:       hsl(38 40% 99%);
  --surface-2:     hsl(36 25% 93%);
  --text:          hsl(28 18% 14%);
  --text-dim:      hsl(28 8% 42%);
  --text-faint:    hsl(28 7% 62%);
  --accent:        hsl(22 72% 48%);  /* darker terracotta for AA on paper */
  --accent-dim:    hsl(22 55% 82%);
  --success:       hsl(145 45% 34%);
  --danger:        hsl(6 68% 46%);
  --warn:          hsl(36 80% 40%);
  --border:        hsl(35 15% 87%);
  --border-strong: hsl(35 15% 78%);
  --shadow:        0 1px 2px hsl(30 15% 40% / .08);
}
```

## 3. Typography

```css
--font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI",
        Roboto, Helvetica, Arial, sans-serif;
/* stats/streaks: font-variant-numeric: tabular-nums; */
```

| token | size | use | line-height |
|---|---|---|---|
| --fs-xs | 11px | badges, % labels, archive count | 1.3 |
| --fs-sm | 13px | sub-items, notes, checklist text | 1.45 |
| --fs-base | 14px | habit names, task titles, inputs | 1.5 |
| --fs-md | 16px | section headers | 1.35 |
| --fs-lg | 20px | date header / greeting | 1.25 |

Weights: 400 body · 500 titles/names · 600 headers + streak number. No italics.
Letter-spacing -0.01em only at --fs-lg.

## 4. Spacing & radius

```css
--s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px; --s7: 48px;
--r-sm: 4px; /* checkboxes, dots, badges */
--r-md: 8px; /* inputs, buttons */
--r-lg: 12px;/* task cards, panels */
--r-full: 999px; /* dots, pills, flame chip */
```

Card padding --s4; sibling-row gap --s2; section gap --s5.

## 5. Components

- **Habit row**: flex `[checkbox] [name+meta] [dot grid] [stats]` on --surface, r-lg,
  transparent 1px border that gains --border-color on hover (no layout shift).
- **Streak chip**: inline-flex pill, accent 18% bg via color-mix, accent text, 600 weight,
  inline SVG flame (not emoji). Streak 0 → gray. Best streak as plain `best 21` in xs/faint.
- **14-day grid**: fourteen 10px dots, 3px gap. done = --dot-done · missed = --dot-missed ·
  today = hollow inset ring in accent · future = transparent + border ring. Each dot a real
  `<button>` with aria-label; hover scale(1.25).
- **Progress ring**: SVG 28×28, track stroke --border; progress circle rotated −90°,
  stroke --success width 3 round cap, dasharray 69.1, dashoffset set by JS, transition .4s.
  % text beside ring, not inside.
- **Task card vs sub-item**: top-level = card w/ shadow r-lg. Sub-items: NO second card —
  nested with margin-left and a 2px left rail (--border-strong), fs-sm titles. Chevron
  rotates .25turn open; collapsed keeps ring visible.
- **Due badge**: pill, xs/500. normal dim/surface-2 · near ≤2d warn-tinted · overdue
  danger-tinted + 600 weight.
- **Checkboxes**: 16px (habit/task) / 14px (sub/checklist), r-sm, unchecked inset border
  ring; checked = accent bg + SVG check draw-on (150ms). Done titles DIM (no strikethrough).
- **Inputs**: ghost style on --surface-2, no border, r-md; add-habit input is a final dim
  "+ New habit" row that brightens on focus.
- **Archive bar**: full-width faint row "Archive (n)"; expanded items render recessed:
  70% opacity, --bg background, no shadows/badges/rings.

## 6. Micro-interactions (exactly five, pure CSS)

1. Check-draw animation on checkbox :checked (150ms)
2. Dot hover scale(1.25) (.12s)
3. Collapse chevron rotate + `grid-template-rows: 0fr→1fr` panel (.25s)
4. Row hover background/border shift (.15s) — no translateY
5. Ring dashoffset sweep (.4s cubic-bezier(.3,.7,.3,1))

All disabled under `prefers-reduced-motion`.

## 7. Accessibility

- Global `:focus-visible` outline 2px accent, offset 2 — never removed
- Contrast verified AA: light accent ≈4.6:1, dark ≈5.5:1; body >12:1 both themes
- Dots/checks are `<button>`s ≥24×24 hit targets with aria-labels
- Progress ring: role="img" + aria-label "{n} of {m} complete"
- Collapsibles: aria-expanded; divider keyboard-resizable (Arrow keys ±16px)
