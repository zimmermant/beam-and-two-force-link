import test from 'node:test';
import assert from 'node:assert/strict';
import { VB, FORCE_U, METRE_U, PANELS, SPLITS, PLACE_MAX_SHIFT, PLACE_TEXT_GAP, LABEL_LIFT,
         polygonLabelSpots, concurrencyLines, concurrencyInPanel, concurrencyPoint, concurrencyCase,
         dashes, DASH_ON, DASH_OFF, CONCUR_MARGIN,
         beamPoints, linkEnd, screenDelta, forceList,
         loadArrow, loadFromHandle, fbdArrows, polygonVertices, fitPolygon,
         labelSpot, placeLabels, labelBox, boxesHit, arrowGeometry, shaftPieces,
         SHAFT_SEG, dist, LINK_RUN_M, LINK_RISE_M } from '../src/layout.js';
import { derive, X1, SPAN } from '../src/physics.js';
import { STATES } from './grid.js';
import { forceLabel } from '../src/scene.js';
import { segPlain } from '../src/format.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the beam is drawn to scale and D sits on the three-four-five slope', () => {
  const p = beamPoints(PANELS.space.baseY, PANELS.space.baseX);
  near(p.B.x - p.A.x, X1 * METRE_U);
  near(p.C.x - p.A.x, SPAN * METRE_U);
  assert.equal(p.A.y, PANELS.space.baseY);
  const D = linkEnd(PANELS.space.baseY, PANELS.space.baseX);
  near(D.x - p.C.x, LINK_RUN_M * METRE_U);
  near(p.C.y - D.y, LINK_RISE_M * METRE_U);          // D is ABOVE C: smaller screen y
  near((p.C.y - D.y) / (D.x - p.C.x), 3 / 4);
  assert.ok(D.x + 40 < SPLITS.upper.x, 'D and its wall must stay inside the upper-left panel');
});

test('screenDelta flips y once, and only once, and scales by the one force scale', () => {
  assert.deepEqual(screenDelta({ x: 3, y: 4 }, 1), { x: 3, y: -4 });
  assert.deepEqual(screenDelta({ x: 3, y: 4 }, 2), { x: 6, y: -8 });
  assert.deepEqual(screenDelta({ x: 4, y: -8 }), { x: 4 * FORCE_U, y: 8 * FORCE_U });
});

test('the load arrow has its tip on B and its length is the magnitude', () => {
  const s = { f: 50, dir: 270 };
  const a = loadArrow(s);
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  assert.deepEqual(a.tip, B);
  near(dist(a.tail, a.tip), 50 * FORCE_U);
  near(a.tail.x, B.x);
  assert.ok(a.tail.y < B.y, 'a downward load is drawn coming from above');
  assert.equal(loadArrow({ f: 0, dir: 270 }), null, 'no load, no arrow');
});

test('dragging the handle and reading the load back are inverses, over the whole grid', () => {
  for (const s of STATES) {
    if (s.f === 0) continue;                         // a zero load has no direction to recover
    const a = loadArrow(s);
    const back = loadFromHandle(a.tail, 0);
    near(back.f, s.f, 1e-9);
    near(((back.dir - s.dir + 540) % 360) - 180, 0, 1e-9);   // the shortest way round, so 359.999... reads as -1e-12
  }
});

test('a handle dropped on B keeps the direction it had, because a zero vector has none', () => {
  const B = beamPoints(PANELS.space.baseY, PANELS.space.baseX).B;
  assert.deepEqual(loadFromHandle({ ...B }, 215), { f: 0, dir: 215 });
});

test('the free-body arrows start where their force acts, and a zero force draws nothing', () => {
  const o = { x: 100, y: 500 };
  const spread = fbdArrows({ f: 50, dir: 270 }, o, true);
  assert.deepEqual(spread.map(a => a.key), ['load', 'link', 'pin']);
  near(spread[0].tail.x, o.x + X1 * METRE_U);        // the load acts at B
  near(spread[1].tail.x, o.x + SPAN * METRE_U);      // the link acts at C
  near(spread[2].tail.x, o.x);                       // the pin acts at A
  for (const a of fbdArrows({ f: 50, dir: 270 }, o, false)) assert.deepEqual(a.tail, o);
  assert.equal(fbdArrows({ f: 0, dir: 270 }, o, false).length, 0);
  assert.equal(fbdArrows({ f: 50, dir: 180 }, o, false).length, 2, 'the link carries nothing, so it draws nothing');
});

test('the polygon starts and ends in the same place, in every state', () => {
  for (const s of STATES) {
    const v = polygonVertices(s);
    assert.equal(v.length, 4);
    near(v[3].x, v[0].x, 1e-12);
    near(v[3].y, v[0].y, 1e-12);
  }
});

test('the fitted polygon lands inside its box, in every state', () => {
  const box = PANELS.poly;
  for (const s of STATES) {
    const v = polygonVertices(s);
    const fit = fitPolygon(v, box);
    assert.ok(fit.scale > 0 && Number.isFinite(fit.scale), JSON.stringify(s));
    for (const p of v.map(fit.map)) {
      assert.ok(p.x >= box.x0 && p.x <= box.x1, `${JSON.stringify(s)}: x ${p.x} outside [${box.x0}, ${box.x1}]`);
      assert.ok(p.y >= box.y0 && p.y <= box.y1, `${JSON.stringify(s)}: y ${p.y} outside [${box.y0}, ${box.y1}]`);
    }
  }
});

test('a polygon with nothing in it still gets a usable scale, and a tiny one is not blown up past the cap', () => {
  const box = PANELS.poly;
  const zero = fitPolygon([{ x: 0, y: 0 }, { x: 0, y: 0 }], box);
  assert.ok(zero.scale > 0 && Number.isFinite(zero.scale));
  assert.ok(fitPolygon(polygonVertices({ f: 5, dir: 270 }), box).scale <= 6);
});

test('a label sits beyond its arrow\'s tip, on the side the arrow points', () => {
  const right = labelSpot({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(right.x > 100 && right.anchor === 'start');
  const left = labelSpot({ x: 0, y: 0 }, { x: -100, y: 0 });
  assert.ok(left.x < -100 && left.anchor === 'end');
  const down = labelSpot({ x: 0, y: 0 }, { x: 0, y: 100 });
  assert.ok(down.y > 100 && down.anchor === 'middle');
});

test('a label box is measured from its anchor, and two that touch are reported as touching', () => {
  const start = labelBox({ x: 100, y: 50, anchor: 'start' }, 10);
  assert.ok(start.x0 === 100 && start.x1 > 100);
  const end = labelBox({ x: 100, y: 50, anchor: 'end' }, 10);
  assert.ok(end.x1 === 100 && end.x0 < 100);
  const mid = labelBox({ x: 100, y: 50, anchor: 'middle' }, 10);
  assert.equal((mid.x0 + mid.x1) / 2, 100);
  assert.ok(start.y0 < 50 && start.y1 > 50, 'the box straddles the baseline');
  assert.ok(boxesHit(start, { x0: 105, x1: 115, y0: 45, y1: 55 }));
  assert.ok(!boxesHit(start, { x0: 400, x1: 420, y0: 45, y1: 55 }));
});

test('placeLabels moves a label off whatever it lands on, and leaves a clear one alone', () => {
  const bounds = { x0: 0, x1: 600, y0: 0, y1: 400 };
  const clear = [{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }];
  assert.deepEqual(placeLabels(clear, [], bounds)[0], clear[0].spot);

  const obstacle = { x0: 40, x1: 200, y0: 30, y1: 70 };
  const moved = placeLabels([{ spot: { x: 50, y: 50, anchor: 'start' }, chars: 8 }], [obstacle], bounds)[0];
  assert.ok(!boxesHit(labelBox(moved, 8), obstacle), 'it still sits on the obstacle');
});

test('placeLabels never moves a pinned label, and pushes the others off it', () => {
  const bounds = { x0: 0, x1: 600, y0: 0, y1: 400 };
  const items = [
    { spot: { x: 100, y: 100, anchor: 'start' }, chars: 9, pinned: true },
    { spot: { x: 104, y: 104, anchor: 'start' }, chars: 9 }
  ];
  const out = placeLabels(items, [], bounds);
  assert.deepEqual(out[0], items[0].spot, 'the pinned one has not moved');
  assert.ok(!boxesHit(labelBox(out[0], 9), labelBox(out[1], 9)), 'the other one has');
});

test('placeLabels keeps every label inside its panel', () => {
  const bounds = { x0: 0, x1: 300, y0: 0, y1: 200 };
  for (const spot of [{ x: 295, y: 10, anchor: 'start' }, { x: 5, y: 195, anchor: 'end' }, { x: 150, y: -20, anchor: 'middle' }]) {
    const out = placeLabels([{ spot, chars: 10 }], [{ x0: 0, x1: 300, y0: 90, y1: 110 }], bounds)[0];
    const b = labelBox(out, 10);
    assert.ok(b.x0 >= bounds.x0 - 0.01 && b.x1 <= bounds.x1 + 0.01, `x ${b.x0}..${b.x1}`);
    assert.ok(b.y0 >= bounds.y0 - 0.01 && b.y1 <= bounds.y1 + 0.01, `y ${b.y0}..${b.y1}`);
  }
});

test('an arrow is cut into pieces short enough that none claims a big rectangle', () => {
  const geo = arrowGeometry({ x: 0, y: 0 }, { x: 200, y: 200 }, 4, 12);
  assert.equal(geo.pieces.length, shaftPieces(Math.hypot(200, 200), 12));
  for (const b of geo.boxes.slice(0, -1)) {
    assert.ok(Math.hypot(b.x1 - b.x0, b.y1 - b.y0) <= SHAFT_SEG + 0.01, 'a shaft piece is too long');
  }
  // the pieces run end to end from the tail to the head's base, and the head's tip is the arrow's tip
  assert.deepEqual(geo.pieces[0].x1, 0);
  assert.deepEqual(geo.head[1], { x: 200, y: 200 });
  for (let i = 1; i < geo.pieces.length; i++) {
    assert.ok(Math.abs(geo.pieces[i].x1 - geo.pieces[i - 1].x2) < 1e-9);
  }
  assert.deepEqual(arrowGeometry({ x: 5, y: 5 }, { x: 5, y: 5 }, 4, 12), { pieces: [], head: null, boxes: [] });
});

test('forceList agrees with derive, in the order the figure introduces them', () => {
  const s = { f: 65, dir: 215 };
  const d = derive(s);
  assert.deepEqual(forceList(s).map(f => f.key), ['load', 'link', 'pin']);
  assert.deepEqual(forceList(s).map(f => f.vec), [d.B, d.C, d.A]);
  assert.deepEqual(forceList(s).map(f => f.at), [X1, SPAN, 0]);
});

// ---- the gaps the mutation audit found: each of these failed to notice a real break ------------

test('the fitted polygon is drawn the right way up: a downward load runs DOWN the page', () => {
  const s = { f: 50, dir: 270 };
  const v = polygonVertices(s);
  const fit = fitPolygon(v, PANELS.poly);
  const from = fit.map(v[0]), to = fit.map(v[1]);
  assert.ok(to.y > from.y, 'the load pulls down, so its side of the polygon must point down the screen');
  // and the link, which pulls up and to the right, must run up and to the right
  const linkTo = fit.map(v[2]);
  assert.ok(linkTo.x > to.x && linkTo.y < to.y, 'the link side must run up and to the right');
});

test('a label beside a horizontal arrow is lifted clear of the line it runs along', () => {
  const right = labelSpot({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(right.y <= -LABEL_LIFT + 1e-9, `a horizontal arrow's label sits at y ${right.y}, not clear above the line`);
  const left = labelSpot({ x: 0, y: 0 }, { x: -100, y: 0 });
  assert.ok(left.y <= -LABEL_LIFT + 1e-9);
  // a steeply sloping arrow is not lifted the same way: its label follows the arrow
  assert.ok(labelSpot({ x: 0, y: 0 }, { x: 0, y: 100 }).y > 0, 'a downward arrow labels below itself');
});

test('a label is never flung far from its arrow, however crowded it is', () => {
  const bounds = { x0: 0, x1: 1000, y0: 0, y1: 1000 };
  const wall = { x0: 0, x1: 600, y0: 0, y1: 600 };            // nothing to escape to within reach
  const spot = { x: 100, y: 100, anchor: 'start' };
  const out = placeLabels([{ spot, chars: 10 }], [wall], bounds)[0];
  const moved = Math.hypot(out.x - spot.x, out.y - spot.y);
  assert.ok(moved <= PLACE_MAX_SHIFT + 1, `the label travelled ${moved.toFixed(0)} units, past the ${PLACE_MAX_SHIFT} cap`);
});

test('a label would rather brush several arrows than hang off the edge of the panel', () => {
  // A dead end on purpose: the band of arrow pieces fills the panel from top to bottom, so there is
  // no clear spot anywhere and no escape upwards or downwards -- the only choice left is between
  // sitting on several pieces and hanging off the edge. Off the edge the label is cut off and
  // unreadable, so it must come back on whatever it has to touch to do it.
  const bounds = { x0: 0, x1: 300, y0: 0, y1: 80 };
  const pieces = [];
  for (let x = 0; x < 300; x += 14) pieces.push({ x0: x, x1: x + 14, y0: 0, y1: 80 });
  const spot = { x: 280, y: 50, anchor: 'start' };
  const out = placeLabels([{ spot, chars: 10 }], pieces, bounds)[0];
  const b = labelBox(out, 10);
  assert.ok(b.x1 <= bounds.x1 + 0.01, `the label hangs off the panel, ending at x ${b.x1.toFixed(1)} of ${bounds.x1}`);
  assert.ok(b.x0 >= bounds.x0 - 0.01, `the label hangs off the other edge, starting at x ${b.x0.toFixed(1)}`);
});

test('an arrowhead never swallows its own arrow, however short the arrow is', () => {
  for (const len of [2, 6, 10, 20, 24, 60, 200]) {
    const geo = arrowGeometry({ x: 0, y: 0 }, { x: len, y: 0 }, 4, 12);
    if (!geo.head) continue;
    const headLen = len - (geo.pieces.at(-1) ? geo.pieces.at(-1).x2 : 0);
    assert.ok(headLen <= len * 0.55 + 1e-9, `a ${len}-unit arrow has a ${headLen.toFixed(1)}-unit head`);
    assert.ok(headLen > 0, 'and it has a head at all');
    for (const p of geo.pieces) {
      assert.ok(p.x2 >= p.x1 - 1e-9, `a ${len}-unit arrow has a shaft piece of negative length`);
    }
  }
});

test('a collapsed polygon puts its two labels on opposite sides of the line', () => {
  // the load along the beam: the link carries nothing, so the polygon is one line out and back
  const sides = [
    { from: { x: 100, y: 200 }, to: { x: 300, y: 200 } },
    { from: { x: 300, y: 200 }, to: { x: 100, y: 200 } }
  ];
  const spots = polygonLabelSpots(sides);
  assert.equal(spots.length, 2);
  assert.ok((spots[0].y - 200) * (spots[1].y - 200) < 0,
    `both labels are on the same side of the collapsed polygon: y ${spots[0].y} and ${spots[1].y}`);
});

// ---- the two free-body panels, over EVERY state ------------------------------------------------
// Not just the 40 the browser harness drives: it was a state between two of its grid steps -- 60 N
// straight along the beam -- that put two labels a hair apart so they read as one string.

function panelClash(s, panel, spread) {
  const origin = spread ? beamPoints(panel.baseY, panel.baseX).A : { x: panel.ox, y: panel.oy };
  const arrows = fbdArrows(s, origin, spread);
  if (!arrows.length) return null;
  const obs = arrows.flatMap(a => arrowGeometry(a.tail, a.tip, 4.2, 12).boxes);
  if (spread) {
    const p = beamPoints(panel.baseY, panel.baseX);
    obs.push({ x0: p.A.x, x1: p.C.x, y0: p.A.y - 8, y1: p.A.y + 8 });
    for (const q of [p.A, p.B, p.C]) obs.push({ x0: q.x - 4.5, x1: q.x + 4.5, y0: q.y - 4.5, y1: q.y + 4.5 });
    for (const line of concurrencyLines(s, panel)) {
      for (const d of line.dashes) {
        obs.push({ x0: Math.min(d.x1, d.x2), x1: Math.max(d.x1, d.x2), y0: Math.min(d.y1, d.y2), y1: Math.max(d.y1, d.y2) });
      }
    }
    const con = concurrencyInPanel(s, panel);
    if (con) obs.push({ x0: con.at.x - 25, x1: con.at.x + 25, y0: con.at.y - 25, y1: con.at.y + 25 });
  }
  // the labels this state really draws, not a worst case: "FB 5 N" and "FCD 104.3 N" are very
  // different widths, and pretending every label is the longest invents clashes that never happen
  const lens = arrows.map(a => segPlain(forceLabel(a.key, a.mag)).length);
  const items = arrows.map((a, i) => ({ spot: labelSpot(a.tail, a.tip), chars: lens[i] }));
  const out = placeLabels(items, obs, panel.box);
  const boxes = out.map((q, i) => labelBox(q, lens[i]));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesHit(boxes[i], boxes[j], PLACE_TEXT_GAP)) return `labels ${i} and ${j} are not a word apart`;
    }
    for (const b of obs) if (boxesHit(boxes[i], b)) return `label ${i} sits on something drawn`;
    const bx = boxes[i];
    if (bx.x0 < panel.box.x0 - 0.01 || bx.x1 > panel.box.x1 + 0.01) return `label ${i} is off the panel sideways`;
    if (bx.y0 < panel.box.y0 - 0.01 || bx.y1 > panel.box.y1 + 0.01) return `label ${i} is off the panel vertically`;
  }
  return null;
}

test('in the point diagram no label lands on another label, on an arrow, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.point, false), null, JSON.stringify(s));
});

test('in the extended diagram no label lands on another label, on anything drawn, or off the panel, in any state', () => {
  for (const s of STATES) assert.equal(panelClash(s, PANELS.ext, true), null, JSON.stringify(s));
});

test('two labels end up a readable gap apart, not merely not touching', () => {
  // the state that showed it: the load along the beam, so the two forces are opposite and in line
  assert.equal(panelClash({ f: 60, dir: 180 }, PANELS.ext, true), null);
  assert.ok(PLACE_TEXT_GAP >= 8, 'a gap under about eight units reads as one word');
  // and the solver really does open that gap, rather than the state happening to be roomy
  const items = [
    { spot: { x: 200, y: 100, anchor: 'end' }, chars: 7 },
    { spot: { x: 202, y: 100, anchor: 'start' }, chars: 7 }
  ];
  const out = placeLabels(items, [], { x0: 0, x1: 600, y0: 0, y1: 400 });
  assert.ok(!boxesHit(labelBox(out[0], 7), labelBox(out[1], 7), PLACE_TEXT_GAP),
    'two labels set side by side were left touching');
});

// ---- the concurrency construction --------------------------------------------------------------

test('the meeting point really is on all three lines of action', () => {
  for (const s of STATES) {
    const p = concurrencyPoint(s);
    if (!p) continue;
    const d = derive(s);
    // the cross product of (P - point of application) with the force must vanish, for each force
    const on = (at, vec, mag) => Math.abs((p.x - at) * vec.y - p.y * vec.x) / mag;
    assert.ok(on(X1, d.B, d.magB) < 1e-6, `${JSON.stringify(s)}: not on the load's line`);
    assert.ok(on(SPAN, d.C, d.magC) < 1e-6, `${JSON.stringify(s)}: not on the link's line`);
    assert.ok(on(0, d.A, d.magA) < 1e-6, `${JSON.stringify(s)}: not on the pin's line`);
  }
});

test('two exactly parallel lines of action are not said to meet anywhere', () => {
  // The load's line is parallel to the link's when tan(theta) = 0.6/0.8. The sliders step by 5
  // degrees and cannot land on it, but the function is pure and must not answer with a point the
  // size of a county when something else calls it.
  const parallel = Math.atan2(LINK_RISE_M, LINK_RUN_M) * 180 / Math.PI;
  assert.equal(concurrencyPoint({ f: 50, dir: parallel }), null, `dir ${parallel}`);
  assert.equal(concurrencyPoint({ f: 50, dir: parallel + 180 }), null);
  // and a hair off parallel still gives a point, just a very distant one
  const near1 = concurrencyPoint({ f: 50, dir: parallel + 0.01 });
  assert.ok(near1 && Number.isFinite(near1.x) && Math.abs(near1.x) > 100, 'it should be far away, not absent');
});

test('the meeting point is only called on-panel when its circle has room there', () => {
  const s = { f: 50, dir: 270 };
  const base = PANELS.ext;
  const at = concurrencyInPanel(s, base).at;            // where it lands in the real panel
  // a panel whose edge passes close under the point: inside the box, but inside the margin too
  const tight = { ...base, box: { x0: at.x - 100, x1: at.x + 100, y0: at.y - 100, y1: at.y + 8 } };
  assert.equal(concurrencyInPanel(s, tight), null, 'a point with no room for its circle is not on the panel');
  assert.equal(concurrencyLines(s, tight).length, 0, 'and nothing is drawn to it');
  const roomy = { ...base, box: { x0: at.x - 100, x1: at.x + 100, y0: at.y - 100, y1: at.y + CONCUR_MARGIN + 1 } };
  assert.ok(concurrencyInPanel(s, roomy), 'with room it is on the panel');
});

test('there is no meeting point exactly when there cannot be one', () => {
  assert.equal(concurrencyPoint({ f: 0, dir: 270 }), null, 'no load, no lines');
  for (const dir of [0, 180, 360]) {
    assert.equal(concurrencyPoint({ f: 50, dir }), null, `dir ${dir}: the link carries nothing`);
  }
  assert.ok(concurrencyPoint({ f: 50, dir: 270 }), 'the ordinary case has one');
  // hand-derived: a vertical load at B, and the link's line y = 0.75(x - 5), meet 1.5 m below B
  const p = concurrencyPoint({ f: 50, dir: 270 });
  near(p.x, X1);
  near(p.y, -1.5);
});

test('the construction is drawn only when its point is on the panel, and every case really happens', () => {
  const tally = { point: 0, far: 0, 'one-line': 0, 'no-load': 0 };
  for (const s of STATES) {
    const c = concurrencyCase(s, PANELS.ext);
    tally[c]++;
    const drawn = concurrencyLines(s, PANELS.ext).length;
    assert.equal(drawn, c === 'point' ? 3 : 0, `${JSON.stringify(s)} is "${c}" but drew ${drawn} lines`);
  }
  for (const [k, v] of Object.entries(tally)) assert.ok(v > 0, `the sliders can never reach the "${k}" case`);
});

test('each construction line runs from its force\'s point of application to the meeting point', () => {
  const s = { f: 50, dir: 270 };
  const pan = PANELS.ext;
  const p = beamPoints(pan.baseY, pan.baseX);
  const con = concurrencyInPanel(s, pan);
  const lines = concurrencyLines(s, pan);
  assert.deepEqual(lines.map(l => l.from), [p.A, p.B, p.C]);
  for (const l of lines) {
    assert.deepEqual(l.to, con.at);
    assert.ok(l.dashes.length >= 1);
    // the dashes start at the point of application and march toward the meeting point
    near(l.dashes[0].x1, l.from.x);
    near(l.dashes[0].y1, l.from.y);
    // the dashes march all the way to the point, give or take the gap after the last one -- which
    // lands neatly on the rim of the circle drawn there
    const last = l.dashes.at(-1);
    assert.ok(Math.hypot(last.x2 - con.at.x, last.y2 - con.at.y) <= DASH_ON + DASH_OFF,
      'the dashes stop well short of the meeting point');
  }
});

test('a construction dash is short enough that its rectangle hugs the line, and none overruns the end', () => {
  for (const s of STATES) {
    for (const line of concurrencyLines(s, PANELS.ext)) {
      const span = Math.hypot(line.to.x - line.from.x, line.to.y - line.from.y);
      for (const d of line.dashes) {
        const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
        assert.ok(len <= DASH_ON + 1e-9, `a dash ${len.toFixed(1)} units long`);
        assert.ok(len > 0);
        // every dash lies between the point of application and the meeting point, not past it
        const reach = Math.hypot(d.x2 - line.from.x, d.y2 - line.from.y);
        assert.ok(reach <= span + 1e-9, `a dash runs ${(reach - span).toFixed(1)} units past the meeting point`);
      }
    }
  }
  // and on a line whose length is not a whole number of dash periods
  for (const d of dashes({ x: 0, y: 0 }, { x: 35, y: 0 })) assert.ok(d.x2 <= 35 + 1e-9, `a dash ends at ${d.x2}`);
});

test('dashes leave gaps: a dashed line is not a solid one', () => {
  const d = dashes({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.ok(d.length > 1);
  const drawn = d.reduce((a, p) => a + Math.hypot(p.x2 - p.x1, p.y2 - p.y1), 0);
  assert.ok(drawn < 100 * 0.75, `the dashes cover ${drawn.toFixed(0)} of 100 units: that is a solid line`);
  assert.deepEqual(dashes({ x: 5, y: 5 }, { x: 5, y: 5 }), [], 'a segment of no length draws nothing');
});
