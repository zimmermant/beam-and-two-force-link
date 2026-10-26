import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement } from './stub-dom.js';
import { calcLines, createPanel } from '../src/panel.js';
import { derive, FORCE_SUB } from '../src/physics.js';
import { STATES } from './grid.js';
import { nb } from './nb.js';

const plain = (html) => html.replace(/<[^>]*>/g, '');
const lines = (s) => Object.fromEntries(calcLines(s).map(l => [l.key, l.html]));

test('the reading panel prints the three magnitudes, each in its own colour class', () => {
  const l = lines({ f: 50, dir: 270 });
  for (const cls of ['load', 'link', 'pin']) assert.ok(l.read.includes(`class="amt c-${cls}"`), l.read);
  assert.equal(plain(l.read).replace(/\u00a0/g, ' '), 'FB = 50 N FCD = 50 N FA = 44.7 N');
});

test('every subscript is a real <sub> element and no ASCII underscore reaches the page', () => {
  for (const s of STATES) {
    for (const l of calcLines(s)) {
      assert.ok(!l.html.includes('_'), `${l.key}: ${l.html}`);
      for (const [, sub] of Object.entries(FORCE_SUB)) {
        if (l.html.includes(sub + '</sub>')) assert.ok(l.html.includes('<sub>' + sub + '</sub>'));
      }
    }
  }
});

test('the panel names which way the link is loaded, and says so for every state', () => {
  assert.ok(plain(lines({ f: 50, dir: 270 }).sense).includes('tension'));
  assert.ok(plain(lines({ f: 50, dir: 90 }).sense).includes('compression'));
  assert.ok(plain(lines({ f: 50, dir: 0 }).sense).includes('carries nothing'));
  assert.ok(plain(lines({ f: 50, dir: 180 }).sense).includes('carries nothing'));
  const tally = { tension: 0, compression: 0, nothing: 0 };
  for (const s of STATES) {
    const t = plain(lines(s).sense);
    if (t.includes('tension')) tally.tension++;
    else if (t.includes('compression')) tally.compression++;
    else tally.nothing++;
  }
  for (const [k, v] of Object.entries(tally)) assert.ok(v > 0, `no state ever reads "${k}"`);
});

test('no load: the panel says there is none and invites the next move', () => {
  const l = lines({ f: 0, dir: 215 });
  assert.ok(plain(l.read).includes('No load'));
  assert.ok(plain(l.sense).includes('Move the load handle'));
});

test('every state produces the same three keys, in the same order', () => {
  for (const s of STATES) {
    assert.deepEqual(calcLines(s).map(l => l.key), ['read', 'sense', 'note']);
  }
});

test('the closing note names which case the concurrency construction is in', () => {
  const note = (s) => plain(lines(s).note);
  // the ordinary case: the three lines meet, and the figure marks the point
  assert.ok(note({ f: 50, dir: 270 }).includes('meet at the circle'), note({ f: 50, dir: 270 }));
  assert.ok(note({ f: 50, dir: 270 }).includes('add to zero'));
  // nearly parallel to the link: the point runs off the page, and the note says so
  assert.ok(note({ f: 50, dir: 215 }).includes('far off the page'), note({ f: 50, dir: 215 }));
  // along the beam: two forces on one line
  for (const dir of [0, 180, 360]) assert.ok(note({ f: 50, dir }).includes('share one line of action'), `dir ${dir}`);
  // nothing at all
  assert.ok(note({ f: 0, dir: 215 }).includes('no lines of action to meet'));

  // every state gets one of the four, and each of the four really happens
  const seen = new Set();
  for (const s of STATES) {
    const t = note(s);
    assert.ok(t.length > 40, JSON.stringify(s));
    for (const [key, want] of [['point', 'meet at the circle'], ['far', 'far off the page'],
      ['one-line', 'share one line'], ['no-load', 'no lines of action']]) {
      if (t.includes(want)) seen.add(key);
    }
  }
  assert.deepEqual([...seen].sort(), ['far', 'no-load', 'one-line', 'point'], 'a case the sliders cannot reach is a dead note');
});

test('the note agrees with what the figure actually draws', async () => {
  const { concurrencyInPanel, PANELS } = await import('../src/layout.js');
  for (const s of STATES) {
    const drawn = !!concurrencyInPanel(s, PANELS.ext);
    const saysDrawn = plain(lines(s).note).includes('meet at the circle');
    assert.equal(saysDrawn, drawn, `${JSON.stringify(s)}: the note and the figure disagree`);
  }
});

test('createPanel writes once and stays quiet while the reading has not changed', () => {
  const el = stubElement('div');
  const panel = createPanel(el);
  panel.render({ f: 50, dir: 270 });
  const first = el.innerHTML;
  assert.ok(first.includes('c-load'));
  el.innerHTML = 'TOUCHED';
  panel.render({ f: 50, dir: 270 });
  assert.equal(el.innerHTML, 'TOUCHED', 'an unchanged reading is not rewritten');
  panel.render({ f: 20, dir: 270 });
  assert.notEqual(el.innerHTML, 'TOUCHED');
  assert.ok(el.innerHTML.includes(nb('20~N')));
});

test('the magnitudes the panel prints are the ones derive gives', () => {
  for (const s of STATES) {
    if (s.f === 0) continue;
    const d = derive(s);
    const t = plain(lines(s).read);
    for (const m of [d.magB, d.magC, d.magA]) assert.ok(t.includes(nb(`${Number(m.toFixed(1))}~N`)), `${JSON.stringify(s)}: ${t}`);
  }
});
