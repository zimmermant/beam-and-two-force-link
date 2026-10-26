import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, fieldSnap, fieldShow } from '../src/fields.js';
import { SCENE_TRACKS } from '../src/scene.js';
import { STATES } from './grid.js';

// The browser harness holds its OWN COPY of some source values (viewBox, slider ids and ranges, defaults, what the
// figure tracks). It cannot import them (it is pasted into a page), so a change to the source that is not made in the
// harness would leave the harness checking a figure that no longer exists. This test LOADS the harness file (it only
// defines things; nothing runs against a page) and compares SIM with FIELDS, the template and SCENE_TRACKS.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const harnessSource = readFileSync(join(root, 'tools', 'browser-harness.js'), 'utf8');
const template = readFileSync(join(root, 'src', 'index.template.html'), 'utf8');
const context = { window: {} };
vm.runInNewContext(harnessSource, context, { filename: 'browser-harness.js' });
const H = context.window.H;
const SIM = JSON.parse(JSON.stringify(H.SIM));   // plain data (also strips the other realm's prototypes; functions are dropped: use H.SIM for those)

test('harness: it loads and exposes its API', () => {
  for (const fn of ['install', 'sweep', 'queries', 'sensitivity', 'budget', 'all', 'checkFigure', 'checkPage', 'show']) assert.equal(typeof context.window.H[fn], 'function', fn);
});

test('harness: the viewBox is the template\'s', () => {
  const t = template.match(/<svg id="fig" viewBox="0 0 (\d+) (\d+)"/);
  assert.ok(t);
  assert.deepEqual([SIM.viewBox.w, SIM.viewBox.h], [Number(t[1]), Number(t[2])]);
});

test('harness: every id it looks up exists in the template', () => {
  const ids = [SIM.figId, SIM.controlsId, SIM.calcId, SIM.resetId, ...SIM.sliders.flatMap(s => [`${s.id}-slider`, `${s.id}-readout`])];
  assert.ok(ids.length >= 7, `only ${ids.length} ids in the harness SIM block`);
  for (const id of ids) assert.ok(template.includes(`id="${id}"`), `#${id} is in the harness but not in the template`);
});

test('harness: SIM.sliders is FIELDS, entry for entry (key, id stem, range, step, decimals)', () => {
  assert.deepEqual(SIM.sliders.map(s => s.key), FIELDS.map(f => f.key), 'the sliders must be the fields, in the same order');
  for (const f of FIELDS) {
    const s = SIM.sliders.find(g => g.key === f.key);
    assert.deepEqual([s.id, s.min, s.max, s.step, s.decimals], [f.id, f.min, f.max, f.step, f.decimals], f.key);
    const t = template.match(new RegExp(`<input type="range" id="${s.id}-slider" min="(-?[\\d.]+)" max="(-?[\\d.]+)" step="([\\d.]+)"`));
    assert.ok(t, `no template input #${s.id}-slider`);
    assert.deepEqual([s.min, s.max, s.step], [t[1], t[2], t[3]].map(Number), `${f.key}: harness range vs template`);
  }
});

test('harness: defaults are the table\'s, and the sweep grid has an in-range value list for every input, with both ends', () => {
  assert.deepEqual(SIM.defaults, Object.fromEntries(FIELDS.map(f => [f.key, f.default])));
  assert.deepEqual(Object.keys(SIM.grid).sort(), FIELDS.map(f => f.key).sort(), 'one grid list per input');
  for (const f of FIELDS) {
    const g = SIM.grid[f.key];
    assert.ok(g.length >= 2 && g.includes(f.min) && g.includes(f.max), `${f.key}: the grid should include both ends`);
    for (const v of g) assert.equal(fieldSnap(f, v), v, `${f.key}: grid value ${v} is not on the slider's grid`);
    if (f.snap) assert.ok(g.includes(0) && g.includes(f.snap.jump) && g.includes(-f.snap.jump), `${f.key}: the grid should include 0 and ±jump`);
  }
});

test('harness: every probe expects what the source\'s own snapping gives (a missing key means the default)', () => {
  const asks = SIM.probes.filter(p => p.ask);
  assert.ok(asks.length >= 3, 'too few ask probes');
  for (const p of asks) {
    for (const f of FIELDS) {
      const raw = p.ask[f.key] === undefined ? f.default : p.ask[f.key];
      const want = p.expect[f.key] === undefined ? f.default : p.expect[f.key];
      assert.equal(fieldSnap(f, raw), want, `probe ${JSON.stringify(p.ask)}: ${f.key}`);
    }
  }
  for (const f of FIELDS.filter(g => g.snap)) {      // probes on both sides of the zone's edge
    const at = (v) => asks.find(p => p.ask[f.key] === v);
    assert.ok(at(f.snap.zone) && at(f.snap.zone).expect[f.key] === 0, `${f.key}: a probe at the zone edge ${f.snap.zone} expecting 0`);
    assert.ok(at(f.snap.jump) && at(f.snap.jump).expect[f.key] === f.snap.jump, `${f.key}: a probe at the jump ${f.snap.jump} expecting itself`);
  }
});

test('harness: query probes expect what a link of that query produces, through the real preset parser', async () => {
  const { parsePresets } = await import('../src/presets.js');
  const queries = SIM.probes.filter(p => p.query);
  assert.ok(queries.length >= 2, 'at least a rejected-echo and an adjusted probe');
  for (const p of queries) {
    const { values } = parsePresets(p.query);
    for (const f of FIELDS) {
      const want = p.expect[f.key] === undefined ? f.default : p.expect[f.key];
      assert.equal(values[f.key] === undefined ? f.default : values[f.key], want, `${p.query.slice(0, 40)}: ${f.key}`);
    }
  }
});

// What a track says the painted element should measure in `state`: want(state), or the linear rule. null means absent.
const trackValue = (t, state) => (t.want ? t.want(state) : (t.origin || 0) + state[t.key] * t.pxPerUnit);

test('harness: SIM.tracks is scene.js SCENE_TRACKS: same elements and measures, same expected value on every state of the grid', () => {
  assert.equal(H.SIM.tracks.length, SCENE_TRACKS.length);
  H.SIM.tracks.forEach((t, i) => {
    const s = SCENE_TRACKS[i];
    assert.deepEqual([t.sel, t.measure], [s.sel, s.measure], `track ${i}`);
    for (const state of STATES) {
      assert.equal(trackValue(t, state), trackValue(s, state), `track ${t.sel} (${t.measure}) at ${JSON.stringify(state)}`);
    }
  });
});

test('harness: every track is complete: a measure, and either a key with pxPerUnit or a want function; a key names a real input', () => {
  for (const t of H.SIM.tracks) {
    assert.ok(['cx', 'cy', 'width', 'height'].includes(t.measure), `${t.sel}: measure ${t.measure}`);
    if (t.want) assert.equal(typeof t.want, 'function');
    else {
      assert.ok(FIELDS.some(f => f.key === t.key), `track ${t.sel} names no input`);
      assert.ok(Number.isFinite(t.pxPerUnit), `track ${t.sel}: pxPerUnit`);
    }
  }
});

test('harness: a track\'s want() returns null (absent) or a finite number on every state, and linear tracks are not silently missing', () => {
  for (const t of H.SIM.tracks) for (const state of STATES) {
    const v = trackValue(t, state);
    assert.ok(v === null || Number.isFinite(v), `${t.sel} at ${JSON.stringify(state)}: ${v}`);
  }
});

test('harness: the minimum text size is 12 px, the minimum figure width 600 px, and the budgets are windows that fit the 740 px column', () => {
  assert.equal(SIM.minTextPx, 12);
  assert.equal(SIM.minFigPx, 600);
  assert.ok(Array.isArray(SIM.viewport) && SIM.viewport.length >= 1);
  for (const v of SIM.viewport) assert.ok(v.width >= 800 && v.height >= 600 && typeof v.note === 'string', JSON.stringify(v));
  assert.ok(SIM.floors.texts >= 4 && SIM.floors.graphics >= 4, 'the non-vacuity floors must be real: at least 4, and no more than your figure always has');
});

test('harness: the readout text it expects (the harness\'s own H.show, not a copy) is what the page prints', () => {
  assert.equal(typeof H.show, 'function');
  for (const f of FIELDS) {
    const s = SIM.sliders.find(g => g.key === f.key);
    for (const v of [f.min, f.max, f.default, 0, -f.step]) assert.equal(H.show(s, v), fieldShow(f, v), `${f.key} ${v}`);
  }
});

test('harness: it offers the page checks and the rule texts name them', () => {
  assert.equal(typeof H.checkPage, 'function');
  assert.match(harnessSource, /THE RULES/);
  for (const word of ['TOP-LEVEL', 'BLIND SPOT', 'tracks', 'floors', 'clearSpot']) assert.ok(harnessSource.includes(word), word);
});
