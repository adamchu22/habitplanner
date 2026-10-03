import assert from 'node:assert';
import { dstr, today, shiftDate, lastNDays, currentStreak, bestStreak, success14, progressPct, moveIn, parseTaskImport, sweepDoneChecks, pruneLog } from './newtab.js';

// date helpers
assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');   // year rollover
assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');    // leap year
assert.equal(dstr(new Date(2026, 1, 5)), '2026-02-05');    // zero-padded
const t = today();
assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
assert.equal(lastNDays(14).length, 14);
assert.equal(lastNDays(14).at(-1), t);

// streaks — hard reset on miss, yesterday-grace for today-not-done-yet
assert.equal(currentStreak({ [t]: true, [shiftDate(t, -1)]: true }), 2);          // today done, chain grows
assert.equal(currentStreak({ [shiftDate(t, -1)]: true }), 1);                     // today not done yet = grace
assert.equal(currentStreak({ [shiftDate(t, -2)]: true }), 0);                     // missed yesterday = reset
assert.equal(currentStreak({}), 0);
assert.equal(currentStreak({ [t]: true, [shiftDate(t, -3)]: true }), 1);          // gap breaks

// best streak ignores recency
assert.equal(bestStreak({
  [shiftDate(t, -10)]: true, [shiftDate(t, -9)]: true, [shiftDate(t, -8)]: true,
  [t]: true
}), 3);
assert.equal(bestStreak({}), 0);

// success over last 14 days only counts in-window days
assert.equal(success14({ [t]: true, ['2000-01-01']: true }), 1);

// progress
assert.equal(progressPct([]), null);                                             // no checklist -> no ring
assert.equal(progressPct([{ done: true }, { done: false }]), 50);
assert.equal(progressPct([{ done: true }, { done: true }]), 100);

// drag & drop reorder
const ids = a => a.map(x => x.id);
let arr = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
assert.equal(moveIn(arr, 'c', 'a', true), true);   assert.deepEqual(ids(arr), ['c', 'a', 'b']);
assert.equal(moveIn(arr, 'a', 'c', false), true);  assert.deepEqual(ids(arr), ['c', 'a', 'b']);
assert.equal(moveIn(arr, 'b', 'a', true), true);   assert.deepEqual(ids(arr), ['c', 'b', 'a']);
assert.equal(moveIn(arr, 'zz', 'a', true), false); // unknown source = no-op

// task import shape detection
const task = { title: 'X', due: null };
const r = parseTaskImport({ items: [task] }).items[0];
assert.equal(r.title, 'X'); assert.ok(r.id);                                   // {items} -> normalized, id generated
assert.equal(parseTaskImport([task]).items.length, 1);                         // bare array
assert.equal(parseTaskImport({ state: { items: [] }, archive: [] }).backup !== undefined, true);
assert.equal(parseTaskImport({ foo: 1 }), null);                               // unrecognized

// boot sweep: done checklist items → Done Log, cleared from the task
const st = {
  items: [{
    id: 'i1', title: 'Ship', checklist: [
      { id: 'c1', text: 'a', done: true },
      { id: 'c2', text: 'b', done: false }
    ],
    subitems: [{ id: 's1', title: 'Docs', checklist: [{ id: 'c3', text: 'c', done: true }] }]
  }],
  tdtLog: []
};
sweepDoneChecks(st);
assert.deepEqual(st.items[0].checklist.map(c => c.text), ['b']);
assert.deepEqual(st.items[0].subitems[0].checklist, []);
assert.equal(st.tdtLog[0].date, today());
assert.deepEqual(st.tdtLog[0].items.map(i => i.label), ['a', 'c']);
assert.deepEqual(st.tdtLog[0].items.map(i => i.context), ['Ship', 'Ship › Docs']);
assert.ok(st.tdtLog[0].items.every(i => i.done));

// prune: completed entries older than 30 days dropped; recent + not-done kept
const old = shiftDate(today(), -31), recent = shiftDate(today(), -5);
const st2 = { tdtLog: [
  { date: old, items: [{ label: 'old-done', done: true }, { label: 'old-open', done: false }] },
  { date: recent, items: [{ label: 'recent-done', done: true }] }
]};
pruneLog(st2);
assert.deepEqual(st2.tdtLog, [
  { date: old, items: [{ label: 'old-open', done: false }] },
  { date: recent, items: [{ label: 'recent-done', done: true }] }
]);

console.log('all checks passed');
