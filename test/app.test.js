import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubElement } from './stub-dom.js';
import { FIELDS, fieldShow, fieldText, fieldSnap } from '../src/fields.js';
import { nb } from './nb.js';
import { PRESET_SHOWN_MAX } from '../src/presets.js';
import { J } from './join.js';
import { NEEDS_SNAP, NEEDS_MARK } from './snap.js';

const template = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.template.html'), 'utf8');
const IDS = ['fig', 'stage', 'calc', 'controls', 'reset', 'from-link', 'status'];
for (const f of FIELDS) IDS.push(`${f.id}-slider`, `${f.id}-readout`, ...(f.snap ? [`${f.id}-zero`] : []), ...(f.mark ? [`${f.id}-mark`] : []));
let boots = 0;

// Runs src/app.js against a stub page, as the browser does on load: the module wires everything and draws once.
// Each call imports a fresh copy (the query string defeats the module cache).
async function boot(search) {
  const els = {};
  for (const id of IDS) els[id] = stubElement(id === 'fig' ? 'svg' : 'div');
  els['from-link'].hidden = true;
  globalThis.document = {
    title: '',
    getElementById: (id) => { assert.ok(els[id], `app.js looked up #${id}, which the stub page lacks`); return els[id]; },
    createElementNS: (ns, name) => stubElement(name)
  };
  globalThis.location = { search };
  await import(`../src/app.js?boot=${++boots}`);
  // a label with a subscript is a <text> of <tspan>s, so its own textContent is empty
  const texts = () => els.fig.children.filter(n => n.tag === 'text')
    .map(n => n.textContent || n.children.map(c => c.textContent).join(''));
  const readout = (f) => els[`${f.id}-readout`].textContent;
  return { els, texts, readout };
}
const query = (pairs) => '?' + pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const other = (f) => (f.default === f.max ? f.min : f.max);

test('page load with no parameters: titled like the template, drawn, defaults in the controls, link note hidden', async () => {
  const { els, texts, readout } = await boot('');
  assert.equal(document.title, template.match(/<title>([^<]*)<\/title>/)[1], 'APP_TITLE and the template <title> must agree');
  assert.ok(texts().length >= 3, 'the figure has texts');
  assert.ok(els.calc.innerHTML.length > 0, 'the calculation is written');
  for (const f of FIELDS) {
    assert.equal(readout(f), fieldShow(f, f.default), f.key);
    assert.equal(els[`${f.id}-slider`].value, String(f.default), f.key);
    assert.equal(els[`${f.id}-slider`].attrs['aria-valuetext'], nb(`${fieldShow(f, f.default)}~${f.unitWord}`));
  }
  assert.equal(els['from-link'].hidden, true);
  assert.equal(els['from-link'].textContent, '');
});

test('page load with parameters: applied before the first draw, described in the note as text', async () => {
  const [a, b] = FIELDS;
  const pairs = [[a.key, String(other(a))]];
  if (b) pairs.push([b.key, 'abc']);
  const { els, readout } = await boot(query(pairs));
  assert.equal(readout(a), fieldShow(a, other(a)));
  if (b) assert.equal(readout(b), fieldShow(b, b.default), 'a rejected parameter leaves the default');
  assert.equal(els['from-link'].hidden, false);
  assert.equal(els['from-link'].textContent, nb(`From the link: ${a.label} = ${fieldShow(a, other(a))}${J(a.unit)}${a.unit}.`) +
    (b ? ` Ignored: ${b.label} = abc (use a number of ${b.unit}).` : ''));
  assert.equal(els['from-link'].innerHTML, '', 'the note is written as text, never as markup');
});

test('a field with snap lights its zero label when a link sets it to 0, and only then', NEEDS_SNAP, async () => {
  for (const f of FIELDS.filter(g => g.snap)) {
    const lit = await boot(query([[f.key, '0']]));
    assert.equal(lit.els[`${f.id}-zero`].classList.contains('on'), true, f.key);
    const unlit = await boot('');
    assert.equal(unlit.els[`${f.id}-zero`].classList.contains('on'), f.default === 0, f.key);
  }
});

test('a field with mark lights its mark label when the slider sits on the marked value, and only then', NEEDS_MARK, async () => {
  for (const f of FIELDS.filter(g => g.mark)) {
    const on = await boot(query([[f.key, String(f.mark.value)]]));
    assert.equal(on.els[`${f.id}-mark`].classList.contains('on'), true, f.key);
    const off = await boot(query([[f.key, String(f.mark.value === f.max ? f.min : f.max)]]));
    assert.equal(off.els[`${f.id}-mark`].classList.contains('on'), false, f.key);
  }
});

test('a hostile parameter reaches the page only as text, capped at the echo length', async () => {
  const bad = '<img src=x onerror=alert(1)>' + 'z'.repeat(60);
  const { els } = await boot(query([[FIELDS[0].key, bad]]));
  assert.equal(els['from-link'].innerHTML, '', 'the note is written with textContent, never as markup');
  assert.ok(els['from-link'].textContent.includes(Array.from(bad).slice(0, PRESET_SHOWN_MAX).join('') + '…'), els['from-link'].textContent);
  assert.ok(!els['from-link'].textContent.includes('alert(1)'), 'the echo is cut before the payload is complete');
  assert.ok(!els.calc.innerHTML.includes('<img'));
});

test('each parameter on its own is applied, the others keep their defaults; unknown keys leave the note hidden', async () => {
  for (const f of FIELDS) {
    const b = await boot(query([[f.key, String(other(f))]]));
    for (const g of FIELDS) assert.equal(b.readout(g), fieldShow(g, g === f ? other(f) : g.default), `${f.key} -> ${g.key}`);
  }
  const f0 = FIELDS[0];
  const near = f0.min + f0.step * 0.4;
  const off = fieldShow(f0, near) !== fieldShow(f0, f0.min) ? near : f0.max + 5 * f0.step;   // off-grid, by an amount the decimals show
  const adj = await boot(query([[f0.key, String(off)]]));
  assert.ok(adj.els['from-link'].textContent.includes('Adjusted: '), adj.els['from-link'].textContent);
  assert.equal(adj.readout(FIELDS[0]), fieldShow(FIELDS[0], fieldSnap(FIELDS[0], off)));
  const none = await boot('?unknown=1');
  assert.equal(none.els['from-link'].hidden, true);
});

test('moving a slider or pressing reset redraws the figure, the calculation and the controls', async () => {
  const { els, texts, readout } = await boot('');
  const before = { texts: texts().join('|'), calc: els.calc.innerHTML };
  for (const f of FIELDS) {
    els[`${f.id}-slider`].value = String(other(f));
    els[`${f.id}-slider`].fire('input');
    assert.equal(readout(f), fieldShow(f, other(f)), f.key);
  }
  assert.notEqual(texts().join('|'), before.texts, 'the figure changed');
  assert.notEqual(els.calc.innerHTML, before.calc, 'the calculation changed');
  els.reset.fire('click');
  for (const f of FIELDS) assert.equal(readout(f), fieldShow(f, f.default), f.key);
  assert.equal(texts().join('|'), before.texts, 'reset redraws the default figure');
  assert.equal(els.calc.innerHTML, before.calc);
});

test('the example link text in the template names the values its URL sets', () => {
  const m = template.match(/<a id="example-link"[^>]*href="\?([^"]*)"[^>]*>([^<]*)</);
  assert.ok(m, 'no <a id="example-link" href="?...">');
  const params = new URLSearchParams(m[1].replace(/&amp;/g, '&'));
  const shown = m[2].replace(/&nbsp;/g, nb('~'));
  for (const f of FIELDS) {
    if (params.get(f.key) === null) continue;
    const v = fieldSnap(f, Number(params.get(f.key)));
    assert.ok(shown.includes(`${f.label} = ` + fieldText(f, v)), `the link text lacks "${f.label} = ${fieldText(f, v)}": ${shown}`);
  }
});
