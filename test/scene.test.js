import test from 'node:test';
import assert from 'node:assert/strict';
import { stubElement, installSvgDocument } from './stub-dom.js';
import { createScene, forceLabel, metreLabel } from '../src/scene.js';
import { segPlain } from '../src/format.js';
import { TEXT, VB, PANELS, beamPoints, FORCE_U } from '../src/layout.js';

import { STATES } from './grid.js';
import { handleSpot } from '../src/interact.js';
import { concurrencyInPanel, labelBox, boxesHit, CONCUR_R } from '../src/layout.js';
import { nb } from './nb.js';

installSvgDocument();

function draw(s) {
  const svg = stubElement('svg');
  createScene(svg).render(s);
  const cls = (n) => (n.attrs.class || '').split(/\s+/);
  const texts = svg.children.filter(n => n.tag === 'text');
  return {
    svg, cls, texts,
    strings: texts.map(n => n.textContent || n.children.map(c => c.textContent).join('')),
    heads: svg.children.filter(n => cls(n).includes('head')),
    shafts: svg.children.filter(n => cls(n).includes('shaft')),
    find: (c) => svg.children.find(n => cls(n).includes(c)),
    all: (c) => svg.children.filter(n => cls(n).includes(c))
  };
}

// An arrow is a run of short collinear shaft lines and then a head path, all SIBLINGS (svg.js explains
// why). They are found by their shared class, e.g. 'poly load'. `startOf` is the first shaft piece's
// first end; `tipOf` is the apex of the head.
const has = (n, ...cs) => cs.every(c => (n.attrs.class || '').split(/\s+/).includes(c));
const partsOf = (d, ...cs) => ({
  shafts: d.shafts.filter(n => has(n, ...cs)),
  head: d.heads.find(n => has(n, ...cs))
});
const startOf = (p) => ({ x: Number(p.shafts[0].attrs.x1), y: Number(p.shafts[0].attrs.y1) });
const tipOf = (head) => {
  const m = head.attrs.d.match(/L([-\d.]+) ([-\d.]+) L/);
  return { x: Number(m[1]), y: Number(m[2]) };
};
// The bounding box of one drawn piece, as the browser harness would measure it.
const lineBox = (n) => ({
  x0: Math.min(Number(n.attrs.x1), Number(n.attrs.x2)), x1: Math.max(Number(n.attrs.x1), Number(n.attrs.x2)),
  y0: Math.min(Number(n.attrs.y1), Number(n.attrs.y2)), y1: Math.max(Number(n.attrs.y1), Number(n.attrs.y2))
});

// ---- structure the browser harness depends on ---------------------------------------------------
test('every graphic is a TOP-LEVEL element with class g, and every label a top-level text.t', () => {
  const { svg, cls } = draw({ f: 50, dir: 215 });
  for (const n of svg.children) {
    if (n.tag === 'text') assert.ok(cls(n).includes('t'), `a text without class t: ${n.textContent}`);
    else assert.ok(cls(n).includes('g'), `a ${n.tag} without class g`);
    assert.equal(n.parent, svg, 'nothing is nested: the harness only measures top-level nodes');
  }
});

test('every label is at least the 12 px floor once the figure is scaled down', () => {
  for (const n of draw({ f: 80, dir: 35 }).texts) {
    const size = Number(n.attrs['font-size']);
    assert.ok(size >= 16, `a label at ${size} units renders under 12 px`);
    for (const span of n.children) {
      assert.ok(Number(span.attrs['font-size']) >= 16, 'a subscript must clear the floor too');
    }
  }
});

test('every arrow is shaft pieces plus one head, all siblings and all class g', () => {
  const d = draw({ f: 50, dir: 215 });
  for (const n of d.shafts) { assert.equal(n.tag, 'line'); assert.ok(has(n, 'g'), 'a shaft piece must be measurable'); }
  for (const n of d.heads) { assert.equal(n.tag, 'path'); assert.ok(has(n, 'g')); }
  assert.equal(d.heads.length, 10, 'the load in the space diagram, three per free-body diagram, three polygon sides');
  for (const key of ['load', 'link', 'pin']) {
    const p = partsOf(d, 'pt', key);
    assert.ok(p.shafts.length >= 1 && p.head, `the point diagram's ${key} arrow`);
  }
});

test('the shaft pieces are short and touch, so together they are one straight line', () => {
  for (const s of STATES) {
    const d = draw(s);
    for (const key of ['load', 'link', 'pin']) {
      const lines = partsOf(d, 'poly', key).shafts;
      for (let i = 1; i < lines.length; i++) {
        assert.ok(Math.abs(Number(lines[i].attrs.x1) - Number(lines[i - 1].attrs.x2)) < 1e-9, 'a gap in the shaft');
        assert.ok(Math.abs(Number(lines[i].attrs.y1) - Number(lines[i - 1].attrs.y2)) < 1e-9, 'a gap in the shaft');
      }
      for (const l of lines) {
        const b = lineBox(l);
        assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 14.001,
          `${JSON.stringify(s)}: a shaft piece claims a ${(b.x1 - b.x0).toFixed(1)} by ${(b.y1 - b.y0).toFixed(1)} rectangle`);
      }
    }
  }
});

// The browser harness's rule 4 -- an arrow must not swallow a joint circle -- looks for an arrow GROUP
// and finds none now that arrows are drawn flat. This replaces it, over every state rather than 38.
test('the load arrow never covers a joint circle in the space diagram', () => {
  for (const s of STATES) {
    const d = draw(s);
    const circles = d.svg.children.filter(n => has(n, 'pc'));
    assert.equal(circles.length, 3, 'the pins at A, C and D');
    const pieces = [...d.shafts, ...d.heads].filter(n => has(n, 'space'));
    for (const c of circles) {
      const cb = { x0: Number(c.attrs.cx) - Number(c.attrs.r), x1: Number(c.attrs.cx) + Number(c.attrs.r),
        y0: Number(c.attrs.cy) - Number(c.attrs.r), y1: Number(c.attrs.cy) + Number(c.attrs.r) };
      for (const n of pieces) {
        if (n.tag !== 'line') continue;
        const b = lineBox(n);
        const over = Math.min(b.x1, cb.x1) - Math.max(b.x0, cb.x0) > 0.5 && Math.min(b.y1, cb.y1) - Math.max(b.y0, cb.y0) > 0.5;
        assert.ok(!over, `${JSON.stringify(s)}: the load arrow covers the joint at (${c.attrs.cx}, ${c.attrs.cy})`);
      }
    }
  }
});

test('render clears the figure first, so two renders leave one figure', () => {
  const svg = stubElement('svg');
  const scene = createScene(svg);
  scene.render({ f: 50, dir: 270 });
  const n = svg.children.length;
  scene.render({ f: 50, dir: 270 });
  assert.equal(svg.children.length, n);
  scene.render({ f: 20, dir: 90 });
  assert.ok(svg.children.length > 0);
});

// ---- what the four panels say ------------------------------------------------------------------
test('all four panels are headed', () => {
  const t = draw({ f: 50, dir: 270 }).strings;
  for (const want of ['The situation', 'Free-body diagram of the beam', 'The beam as a single point', 'The forces tip to tail']) {
    assert.ok(t.some(s => s === want), `no panel headed "${want}": ${t.join(' | ')}`);
  }
});

test('the default load, 50 N down: every magnitude is printed three times, once per diagram', () => {
  const t = draw({ f: 50, dir: 270 }).strings;
  assert.equal(t.filter(s => s === nb('FB 50~N')).length, 4, 'the load: space diagram and three others');
  assert.equal(t.filter(s => s === nb('FCD 50~N')).length, 3);
  assert.equal(t.filter(s => s === nb('FA 44.7~N')).length, 3);
  assert.ok(t.includes(nb('3.0~m')) && t.includes(nb('2.0~m')), 'the beam is dimensioned');
  assert.ok(t.includes(nb('1.6~m')) && t.includes(nb('1.2~m')), 'the slope triangle is dimensioned');
  for (const name of ['A', 'B', 'C', 'D']) assert.ok(t.includes(name), `point ${name} is named`);
});

test('a label is its vector symbol and its magnitude, with the subscript as a real tspan', () => {
  assert.equal(segPlain(forceLabel('link', 12.25)), nb('FCD 12.3~N'));
  // the vector arrow is DRAWN over the F (svg.js), not typed: the plain text carries no arrow glyph
  assert.deepEqual(forceLabel('pin', 10)[0], { t: 'F', vec: true });
  assert.ok(forceLabel('pin', 10)[1].sub, 'the subscript segment is marked as one');
  assert.equal(metreLabel(2), nb('2.0~m'));
  const node = draw({ f: 50, dir: 270 }).texts.find(n => n.children.length);
  assert.ok(node, 'at least one label is built from tspans');
  assert.ok(node.children.some(c => Number(c.attrs['font-size']) === 16), 'a lowered subscript tspan');
  assert.ok(!segPlain(forceLabel('pin', 10)).includes('_'), 'an ASCII underscore must never reach the screen');
});

test('the load arrow points INTO B, with its tail where the handle is drawn', () => {
  const d = draw({ f: 50, dir: 270 });
  const load = partsOf(d, 'space', 'load');
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  assert.deepEqual(tipOf(load.head), B);
  const handle = d.find('load-handle');
  assert.equal(Number(handle.attrs.cx), startOf(load).x);
  assert.equal(Number(handle.attrs.cy), B.y - 50 * FORCE_U);
});

test('the handle is always drawn, keyboard-reachable and named, even with no load at all', () => {
  for (const s of [{ f: 50, dir: 270 }, { f: 0, dir: 270 }]) {
    const h = draw(s).find('load-handle');
    assert.ok(h, `no handle at f = ${s.f}`);
    assert.equal(h.attrs.tabindex, '0');
    assert.ok((h.attrs['aria-label'] || '').length > 10);
  }
});

test('no load: no force arrows anywhere, and the polygon panel says so', () => {
  const d = draw({ f: 0, dir: 270 });
  assert.equal(d.heads.length, 0);
  assert.equal(d.shafts.length, 0);
  assert.ok(d.strings.some(s => s.includes('nothing to add up')), d.strings.join(' | '));
});

test('a load along the beam: the link draws no arrow, and only the other two remain', () => {
  const d = draw({ f: 60, dir: 180 });
  assert.equal(d.heads.filter(n => has(n, 'link')).length, 0, 'a zero force has no arrow');
  assert.equal(d.heads.length, 1 + 2 + 2 + 2, 'the load in panel one, two per free-body diagram, two sides of the flat polygon');
});

test('the polygon that is drawn really closes, in every state', () => {
  for (const s of STATES) {
    const d = draw(s);
    let x = 0, y = 0, sides = 0;
    for (const key of ['load', 'link', 'pin']) {
      const p = partsOf(d, 'poly', key);
      if (!p.head) continue;
      const t = tipOf(p.head), f = startOf(p);
      x += t.x - f.x;
      y += t.y - f.y;
      sides++;
    }
    if (!sides) continue;
    assert.ok(Math.hypot(x, y) < 1e-6, `${JSON.stringify(s)}: the drawn polygon misses closing by ${Math.hypot(x, y).toFixed(4)} units`);
  }
});

test('nothing is drawn outside the viewBox, in any state', () => {
  for (const s of STATES) {
    const d = draw(s);
    for (const n of d.shafts) {
      const b = lineBox(n);
      assert.ok(b.x0 >= -2 && b.x1 <= VB.w + 2, `${JSON.stringify(s)}: x ${b.x0.toFixed(1)}..${b.x1.toFixed(1)}`);
      assert.ok(b.y0 >= -2 && b.y1 <= VB.h + 2, `${JSON.stringify(s)}: y ${b.y0.toFixed(1)}..${b.y1.toFixed(1)}`);
    }
  }
});

// ---- the gaps the mutation audit found --------------------------------------------------------

test('the extended diagram puts each force where it acts, not all three on A', () => {
  const d = draw({ f: 50, dir: 215 });
  const starts = ['load', 'link', 'pin'].map(k => startOf(partsOf(d, 'ext', k)).x);
  const unique = new Set(starts.map(x => Math.round(x)));
  assert.equal(unique.size, 3, `the three forces start at ${starts.join(', ')}: they must be spread along the beam`);
  assert.ok(starts[2] < starts[0] && starts[0] < starts[1], 'in the order A, B, C along the beam');
  // the point diagram does the opposite: every tail on one spot
  const o = ['load', 'link', 'pin'].map(k => startOf(partsOf(draw({ f: 50, dir: 215 }), 'pt', k)).x);
  assert.equal(new Set(o.map(x => Math.round(x))).size, 1, 'the point diagram starts them all together');
});

test('the drawn handle is exactly where the drag code goes looking for it, in every state', () => {
  for (const s of STATES) {
    const h = draw(s).find('load-handle');
    const want = handleSpot(s);
    assert.ok(Math.abs(Number(h.attrs.cx) - want.x) < 1e-9, `${JSON.stringify(s)}: cx ${h.attrs.cx} vs ${want.x}`);
    assert.ok(Math.abs(Number(h.attrs.cy) - want.y) < 1e-9, `${JSON.stringify(s)}: cy ${h.attrs.cy} vs ${want.y}`);
  }
});

// ---- the concurrency construction, as the figure really draws it -------------------------------

test('the meeting point is marked with exactly one circle, where the geometry puts it, and only then', () => {
  let marked = 0;
  for (const s of STATES) {
    const d = draw(s);
    const circles = d.svg.children.filter(n => has(n, 'concur'));
    const con = concurrencyInPanel(s, PANELS.ext);
    if (!con) {
      assert.equal(circles.length, 0, `${JSON.stringify(s)}: a circle with nowhere to be`);
      continue;
    }
    assert.equal(circles.length, 1, `${JSON.stringify(s)}: ${circles.length} meeting points`);
    assert.ok(Math.abs(Number(circles[0].attrs.cx) - con.at.x) < 1e-9, JSON.stringify(s));
    assert.ok(Math.abs(Number(circles[0].attrs.cy) - con.at.y) < 1e-9, JSON.stringify(s));
    assert.ok(Number(circles[0].attrs.r) >= 5, 'too small to see');
    marked++;
  }
  assert.ok(marked > 100, `only ${marked} states draw the construction: the test is nearly vacuous`);
});

test('the construction is drawn UNDER the arrows, so the forces read first', () => {
  const d = draw({ f: 50, dir: 270 });
  const order = d.svg.children;
  const lastDash = order.map((n, i) => (has(n, 'loa') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  const firstArrow = order.findIndex(n => has(n, 'ext', 'arrow'));
  assert.ok(lastDash >= 0, 'the construction is drawn at all');
  assert.ok(firstArrow >= 0);
  assert.ok(lastDash < firstArrow,
    `the last construction dash is at ${lastDash} and the first free-body arrow at ${firstArrow}: the dashes must come first`);
});

test('the construction is dashed, not one long line, and every piece is a measurable graphic', () => {
  const d = draw({ f: 50, dir: 270 });
  const loa = d.svg.children.filter(n => has(n, 'loa'));
  assert.ok(loa.length >= 12, `only ${loa.length} dashes: a dashed line should be made of many`);
  for (const n of loa) {
    assert.equal(n.tag, 'line');
    assert.ok(has(n, 'g'), 'a dash the overlap checks cannot see');
    const b = lineBox(n);
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= 9.001, 'a dash long enough to claim a big rectangle');
  }
});

test('no force label crowds the meeting point, which has no label of its own', () => {
  for (const s of STATES) {
    const con = concurrencyInPanel(s, PANELS.ext);
    if (!con) continue;
    const d = draw(s);
    const ring = { x0: con.at.x - CONCUR_R - 12, x1: con.at.x + CONCUR_R + 12,
      y0: con.at.y - CONCUR_R - 12, y1: con.at.y + CONCUR_R + 12 };
    for (const t of d.texts) {
      const str = t.textContent || t.children.map(c => c.textContent).join('');
      if (!/^F/.test(str)) continue;                       // only the force labels can get near it
      const spot = { x: Number(t.attrs.x), y: Number(t.attrs.y), anchor: t.attrs['text-anchor'] };
      if (spot.y < PANELS.ext.box.y0) continue;            // a label in one of the upper panels
      assert.ok(!boxesHit(labelBox(spot, str.length), ring, 0),
        `${JSON.stringify(s)}: "${str}" sits on the meeting point`);
    }
  }
});
