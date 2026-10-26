import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stubElement } from './stub-dom.js';
import { PAGES, DISPLAY_MODULES, MODULES } from '../build.js';
import { FIELDS, fieldShow, fieldText } from '../src/fields.js';
import { nb } from './nb.js';
import { VB, handleSpotOf } from './display-helpers.js';
import { fmt } from '../src/format.js';
import { FORCE_DP } from '../src/physics.js';

// the figure prints forces through fmt, which drops a trailing zero: 70, not 70.0
const asDrawn = (m) => fmt(m, FORCE_DP);
import { J } from './join.js';

// The display page: the four diagrams, and dragging the load. Everything it draws comes from the same
// scene module as the main page, so these tests are about what is AROUND the figure -- that the page
// really has dropped the controls and the reading panel, that it still wires up the drag, and that it
// has not quietly drifted from the main page's figure.
const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const display = readFileSync(join(src, 'display.template.html'), 'utf8');
const main = readFileSync(join(src, 'index.template.html'), 'utf8');
const css = readFileSync(join(src, 'display.css'), 'utf8');

test('the display page is in PAGES, with its own template, css and modules', () => {
  const page = PAGES.find(p => p.name === 'display');
  assert.ok(page, 'no page named display');
  assert.equal(page.template, 'display.template.html');
  assert.equal(page.out, 'beam_link_fbd_display.html');
  assert.deepEqual(page.css, ['styles.css', 'display.css'], 'it shares the colours and the handle styles');
  assert.deepEqual(page.modules, DISPLAY_MODULES);
  assert.notEqual(page.out, PAGES.find(p => p.name === 'main').out, 'the two pages are different files');
});

test('the display page leaves out exactly the modules it has no use for', () => {
  const gone = MODULES.filter(m => !DISPLAY_MODULES.includes(m));
  assert.deepEqual(gone.sort(), ['app.js', 'controls.js', 'panel.js'].sort(),
    'it should drop the sliders, the reading panel and the main entry module, and nothing else');
  assert.ok(DISPLAY_MODULES.includes('interact.js'), 'the drag is the whole interaction: it must be there');
  assert.ok(DISPLAY_MODULES.includes('scene.js') && DISPLAY_MODULES.includes('physics.js'));
  assert.equal(DISPLAY_MODULES.at(-1), 'app-display.js', 'the entry module runs last');
});

test('the display template has both inline markers and the figure, and nothing else to interact with', () => {
  for (const marker of ['<!--INLINE_CSS-->', '<!--INLINE_JS-->']) assert.ok(display.includes(marker), marker);
  assert.ok(display.includes('id="fig"'), 'the figure');
  assert.ok(display.includes('id="stage"'), 'the drag root');
  assert.ok(display.includes('id="from-link"'), 'the preset note');
  for (const id of ['controls', 'calc', 'reset']) {
    assert.ok(!display.includes(`id="${id}"`), `#${id} should be gone from the display page`);
  }
  for (const f of FIELDS) {
    assert.ok(!display.includes(`${f.id}-slider`), `${f.key}'s slider should be gone`);
    assert.ok(!display.includes(`${f.id}-readout`), `${f.key}'s readout should be gone`);
  }
  assert.ok(!/<input\b/.test(display) && !/<button\b/.test(display), 'no input and no button');
  assert.ok(!/<h1\b/.test(display), 'no heading either: the four panels are titled inside the figure');
});

test('the display page tells the browser harness it has no controls, and the main page does not', () => {
  assert.ok(/<svg id="fig" data-controls="none"/.test(display),
    'without this the harness looks for sliders that are not there; and because the PAGE says it, a page that lost its controls by accident still fails');
  assert.ok(!main.includes('data-controls'), 'the main page has its controls and must be checked for them');
});

test('both pages draw the same figure at the same viewBox', () => {
  const vb = (html) => html.match(/<svg id="fig"[^>]*viewBox="([^"]*)"/)[1];
  assert.equal(vb(display), vb(main), 'the two viewBoxes have drifted apart');
});

test('the display figure is sized to FIT the window, so the page can never scroll', () => {
  assert.ok(/body\.display\s*\{[^}]*height:\s*100vh/.test(css), 'the page is exactly the window tall');
  assert.ok(/body\.display\s*\{[^}]*overflow:\s*hidden/.test(css), 'and nothing scrolls');
  assert.ok(/\.fig-fill\s*\{[^}]*position:\s*relative/.test(css));
  assert.ok(/body\.display #fig\s*\{[^}]*position:\s*absolute/.test(css), 'the svg fills its box absolutely');
  assert.ok(!/preserveAspectRatio/.test(display),
    'the default "meet" is what letterboxes the figure; setting it would have to be deliberate');
});

// ---- the page as it boots -----------------------------------------------------------------------
const IDS = ['fig', 'stage', 'from-link'];
let boots = 0;

// The stage is what the drag listens on, and the drag needs to know where the figure sits on the
// screen. One viewBox unit per pixel, origin at the top left, so a client point IS a viewBox point.
async function boot(search) {
  const els = {};
  for (const id of IDS) els[id] = stubElement(id === 'fig' ? 'svg' : 'div');
  els['from-link'].hidden = true;
  els.stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: VB.w, height: VB.h });
  globalThis.document = {
    title: '',
    getElementById: (id) => { assert.ok(els[id], `app-display.js looked up #${id}, which the display page lacks`); return els[id]; },
    createElementNS: (ns, name) => stubElement(name)
  };
  globalThis.location = { search };
  await import(`../src/app-display.js?boot=${++boots}`);
  const texts = () => els.fig.children.filter(n => n.tag === 'text')
    .map(n => n.textContent || n.children.map(c => c.textContent).join(''));
  return { els, texts };
}

test('it boots: titled like its template, the figure drawn, the note hidden', async () => {
  const { els, texts } = await boot('');
  assert.equal(document.title, display.match(/<title>([^<]*)<\/title>/)[1], 'the title and the template must agree');
  assert.ok(texts().length >= 10, `only ${texts().length} labels drawn`);
  assert.ok(texts().some(t => t.startsWith('The situation')), 'the four panels are there');
  assert.ok(texts().some(t => t.startsWith('The forces tip to tail')));
  assert.equal(els['from-link'].hidden, true);
  assert.equal(els['from-link'].textContent, '');
  assert.ok(els.fig.children.some(n => (n.attrs.class || '').includes('load-handle')), 'the drag handle is drawn');
});

test('a link sets the load, and says so as text', async () => {
  const [a] = FIELDS;
  const other = a.default === a.max ? a.min : a.max;
  const { els } = await boot(`?${a.key}=${other}`);
  assert.equal(els['from-link'].hidden, false);
  assert.equal(els['from-link'].innerHTML, '', 'the note is written with textContent, never as markup');
  assert.equal(els['from-link'].textContent, nb(`From the link: ${a.label} = ${fieldShow(a, other)}${J(a.unit)}${a.unit}.`));
  assert.ok(els.fig.children.some(n => n.tag === 'text'), 'and the figure is drawn from it');
});

test('a hostile link reaches the display page only as text', async () => {
  const { els } = await boot(`?${FIELDS[0].key}=${encodeURIComponent('<img src=x onerror=alert(1)>')}`);
  assert.equal(els['from-link'].innerHTML, '');
  assert.ok(els['from-link'].textContent.includes('<img'), 'it is shown, as text');
  assert.ok(!els['from-link'].textContent.includes('alert(1)'), 'and cut short');
});

test('the figure redraws when the load changes, with the same numbers the main page would print', async () => {
  const { els, texts } = await boot('?f=70&dir=215');
  const shown = texts().join(' | ');
  assert.ok(shown.includes(nb('FB 70~N')), shown);
  // the pin and the link follow from the physics, not from anything on this page
  const { derive } = await import('../src/physics.js');
  const d = derive({ f: 70, dir: 215 });
  assert.ok(shown.includes(nb(`FCD ${asDrawn(d.magC)}~N`)), shown);
  assert.ok(shown.includes(nb(`FA ${asDrawn(d.magA)}~N`)), shown);
  assert.ok(fieldText(FIELDS[0], 70).length > 0);
});

// ---- the one interaction the page has ----------------------------------------------------------

test('dragging the load redraws the whole figure: the drag is attached AND the figure follows', async () => {
  const { els, texts } = await boot('?f=40&dir=270');
  const load = () => texts().find(t => /^FB/.test(t));
  const before = load();
  assert.equal(before, nb('FB 40~N'));

  // grab the handle where the figure drew it, and pull it further from B
  const spot = handleSpotOf({ f: 40, dir: 270 });
  const ev = (type, x, y) => els.stage.fire(type, { type, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, target: null, preventDefault() {} });
  ev('pointerdown', spot.x, spot.y);
  ev('pointermove', spot.x, spot.y - 25);
  ev('pointerup', spot.x, spot.y - 25);

  const after = load();
  assert.notEqual(after, before, 'the figure still shows the old load: either the drag is not attached, or nothing redraws it');
  assert.equal(after, nb('FB 70~N'), 'and it shows the load the handle was dropped at');
  // the other two forces followed as well, so the WHOLE figure was redrawn, not just one label
  const { derive } = await import('../src/physics.js');
  const d = derive({ f: 70, dir: 270 });
  const shown = texts().join(' | ');
  assert.ok(shown.includes(nb(`FCD ${asDrawn(d.magC)}~N`)), shown);
  assert.ok(shown.includes(nb(`FA ${asDrawn(d.magA)}~N`)), shown);
});

test('a press nowhere near the handle leaves the display page alone', async () => {
  const { els, texts } = await boot('?f=40&dir=270');
  const before = texts().join('|');
  const ev = (type, x, y) => els.stage.fire(type, { type, clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, target: null, preventDefault() {} });
  ev('pointerdown', 900, 560);
  ev('pointermove', 700, 400);
  ev('pointerup', 700, 400);
  assert.equal(texts().join('|'), before);
});
