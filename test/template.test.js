import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIELDS, UNIT_JOIN, fieldShow } from '../src/fields.js';
import { parsePresets } from '../src/presets.js';
import { NEEDS_MARK } from './snap.js';

// The template and the stylesheet are text, so their conventions are pinned as text. The markup of the sliders is
// written by hand (it is the part you lay out); these tests make sure every entry of FIELDS has all its parts.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const html = readFileSync(join(src, 'index.template.html'), 'utf8');
const css = readFileSync(join(src, 'styles.css'), 'utf8');
const count = (s, re) => (s.match(re) || []).length;
// What the template writes between a number and its unit: &nbsp;, or nothing for a unit in UNIT_JOIN ("40°").
const sepHtml = (unit) => (Object.hasOwn(UNIT_JOIN, unit) ? UNIT_JOIN[unit] : '&nbsp;');

// A field's symbol as the template must write it: a subscript is a real <sub> element, never an ASCII
// underscore and never a Unicode subscript glyph (which would draw below the 12 px floor).
const symHtml = (f) => (f.sub ? `${f.symbol}<sub>${f.sub}</sub>` : f.symbol);

test('the template has each inline marker exactly once', () => {
  assert.equal(count(html, /<!--INLINE_CSS-->/g), 1);
  assert.equal(count(html, /<!--INLINE_JS-->/g), 1);
});

test('every id app.js looks up literally exists in the template', () => {
  const app = readFileSync(join(src, 'app.js'), 'utf8');
  const ids = [...app.matchAll(/getElementById\('([\w-]+)'\)/g)].map(m => m[1]);
  assert.ok(ids.length >= 4, `only ${ids.length} ids found in app.js`);
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `#${id} is missing from the template`);
});

test('every FIELDS entry has its slider with the table\'s range and default, a labelled readout, and a unit after it', () => {
  for (const f of FIELDS) {
    const slider = html.match(new RegExp(`<input type="range" id="${f.id}-slider" min="([^"]*)" max="([^"]*)" step="([^"]*)" value="([^"]*)"`));
    assert.ok(slider, `${f.key}: no <input type="range" id="${f.id}-slider" min max step value> in the template`);
    assert.deepEqual(slider.slice(1).map(Number), [f.min, f.max, f.step, f.default], `${f.key}: the template's range differs from FIELDS`);
    const want = `<label for="${f.id}-slider"><b>${f.label}</b></label> ${symHtml(f)} = <b id="${f.id}-readout" class="readout">${fieldShow(f, f.default)}</b>${sepHtml(f.unit)}${f.unit}`;
    assert.ok(html.includes(want), `${f.key}: the heading line must read ${want}`);
  }
});

test('every FIELDS entry\'s scale labels show its two ends with the unit', () => {
  for (const f of FIELDS) {
    for (const end of [f.min, f.max]) {
      const shown = (end > 0 && f.snap ? '+' : '') + fieldShow(f, end);
      assert.ok(html.includes(`<span>${shown}${sepHtml(f.unit)}${f.unit}`), `${f.key}: no scale label "${shown}${sepHtml(f.unit)}${f.unit}"`);
    }
  }
});

test('the marked zero: a tick and a lit label for each field with snap, and for no other', () => {
  const snapFields = FIELDS.filter(f => f.snap);
  assert.equal(count(html, /<i class="zt"><\/i>/g), snapFields.length, 'one zero tick per snap field');
  assert.equal(count(html, /class="zero-label"/g), snapFields.length, 'one zero label per snap field');
  for (const f of snapFields) {
    assert.ok(html.includes(`id="${f.id}-zero" class="zero-label"`), `${f.key}: no #${f.id}-zero label`);
    const block = html.slice(html.indexOf(`id="${f.id}-slider"`) - 400, html.indexOf(`id="${f.id}-slider"`) + 600);
    assert.ok(block.includes('<i class="zt"></i>'), `${f.key}: the zero tick is not in the same block as its slider`);
  }
  for (const f of FIELDS.filter(g => !g.snap)) {
    assert.ok(!html.includes(`id="${f.id}-zero"`), `${f.key} has no snap, so it has no zero label`);
  }
});

test('every field with mark has its label at the marked value\'s place on the scale, with the value and unit, and no other field has one', NEEDS_MARK, () => {
  const marked = FIELDS.filter(f => f.mark);
  assert.equal(count(html, /class="mark-label"/g), marked.length, 'one mark label per mark field');
  for (const f of marked) {
    const m = html.match(new RegExp(`<span id="${f.id}-mark" class="mark-label" style="left:([\\d.]+)%">([^<]*)</span>`));
    assert.ok(m, `${f.key}: no <span id="${f.id}-mark" class="mark-label" style="left:P%">...</span>`);
    const pct = 100 * (f.mark.value - f.min) / (f.max - f.min);
    assert.ok(Math.abs(Number(m[1]) - pct) < 0.01, `${f.key}: the mark sits at ${m[1]}% but ${f.mark.value} is at ${pct.toFixed(2)}% of the scale`);
    assert.equal(m[2], `${fieldShow(f, f.mark.value)}${sepHtml(f.unit)}${f.unit} (${f.mark.label})`, `${f.key}: the mark's text`);
  }
  for (const f of FIELDS.filter(g => !g.mark)) assert.ok(!html.includes(`id="${f.id}-mark"`), `${f.key} has no mark`);
});

test('the figure has a viewBox and a label; the calculation panel is a polite live region; the title matches the heading', () => {
  assert.match(html, /<svg id="fig" viewBox="0 0 \d+ \d+" role="img" aria-label="[^"]+"/);
  assert.match(html, /<div id="calc" aria-live="polite">/);
  const title = html.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(html.match(/<h1>([^<]*)<\/h1>/)[1], title, '<title> and <h1> differ');
});

test('the example link is a valid preset: every value is on the grid, nothing is adjusted or ignored', () => {
  const m = html.match(/<a id="example-link"[^>]*href="\?([^"]*)"/);
  assert.ok(m, 'no <a id="example-link" href="?...">');
  const p = parsePresets('?' + m[1].replace(/&amp;/g, '&'));
  assert.deepEqual(p.adjusted, []);
  assert.deepEqual(p.ignored, []);
  assert.ok(Object.keys(p.values).length >= 1, 'the link sets nothing');
});

test('the page is one 740 px centred column, side by side from 700 px', () => {
  assert.match(css, /\.page \{ max-width: 740px; margin: 0 auto; \}/);
  assert.match(css, /\.fig-col \{ max-width: 740px;/);
  assert.match(css, /@media \(min-width: 700px\)/);
});

test('every interactive element visibly responds: hover, active and focus-visible rules exist', () => {
  for (const sel of ['.btn', '.more']) {
    for (const state of [':hover', ':active', ':focus-visible']) {
      assert.ok(css.includes(`${sel}${state} {`), `${sel}${state} has no rule`);
    }
  }
  for (const state of [':hover', ':active', ':focus-visible']) {
    assert.ok(css.includes(`input[type=range]${state}::-webkit-slider-thumb`), `slider thumb ${state}`);
    assert.ok(css.includes(`input[type=range]${state}::-moz-range-thumb`), `slider thumb ${state} (Firefox)`);
  }
  assert.ok(css.includes('.zero-label.on'), 'the zero label lights up');
  assert.ok(css.includes('.mark-label.on'), 'the mark label lights up');
});

test('a subscript in the calculation or the controls keeps the 12 px floor (the browser default is 83% of the parent)', () => {
  assert.match(css, /#calc sub, #controls sub \{ font-size: 12px;/);
});
