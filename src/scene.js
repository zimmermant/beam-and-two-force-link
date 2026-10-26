import { fmt, fmtFixed } from './format.js';
import { unitText } from './fields.js';
import { el, clear, text, arrow, hatch, segPlain, COLORS } from './svg.js';
import { derive, cosDeg, sinDeg, FORCE_DP, FORCE_SUB, X1, X2 } from './physics.js';
import { TEXT, SUB, HEAD_MAX, HANDLE_R, FORCE_U, PANELS, SPLITS, shaftPieces, PLACE_NAME_SHIFT,
         CONCUR_R, concurrencyInPanel, concurrencyLines,
         LINK_RUN_M, LINK_RISE_M, beamPoints, linkEnd, loadArrow, fbdArrows,
         polygonVertices, fitPolygon, labelSpot, polygonLabelSpots, placeLabels } from './layout.js';

// The figure. One svg, four panels, redrawn from the stored inputs on every change. Every graphic is a
// TOP-LEVEL element with class `g` and every label a TOP-LEVEL `text.t`, because that is all the browser
// harness can measure.
//
// NOTATION: a force is never named after a point. See src/physics.js.

// A force's vector name: 'F' with a DRAWN arrow over it (see svg.js: the Unicode combining arrow does
// not render), then its subscript as a lowered tspan. The subscripts come from physics.js so the figure
// and the reading panel can never disagree, and a force is never named after a point.
const symbolSegs = (key) => [{ t: 'F', vec: true }, { t: FORCE_SUB[key], sub: true }];
const COLOR_OF = { load: COLORS.load, link: COLORS.link, pin: COLORS.pin };
const SHAFT = 4.2;
const DIM_DP = 1;

// The length of an arrow's FIRST shaft piece, which is the `line` the browser harness measures (the
// shaft is drawn in short collinear pieces: see svg.js). One formula, shared by the tracks below.
export function firstPiece(mag) {
  const len = mag * FORCE_U;
  if (!(len > 0)) return 0;
  const head = Math.min(HEAD_MAX, len * 0.55);
  return (len - head) / shaftPieces(len, head);
}

// What the browser harness must find painted where, for each state. The harness keeps its OWN copy of
// this table (tools/browser-harness.js) written from the physics rather than from this file, and
// test/harness.test.js fails if the two ever disagree on any state of the grid. `want` returns null
// when the element must be ABSENT.
//
// Two tracks follow the handle, which is the thing the student moves; two follow the first piece of a
// free-body arrow's shaft, which is the thing the physics moves. The link arrow vanishes whenever the load is along the
// beam, so that track also checks the degenerate case is really drawn as nothing.
export const SCENE_TRACKS = [
  { sel: 'circle.load-handle', measure: 'cx',
    want: (s) => beamPoints(PANELS.space.baseY, PANELS.space.baseX).B.x - s.f * cosDeg(s.dir) * FORCE_U },
  { sel: 'circle.load-handle', measure: 'cy',
    want: (s) => (s.f === 0 ? PANELS.space.baseY - 46 : PANELS.space.baseY + s.f * sinDeg(s.dir) * FORCE_U) },
  { sel: 'line.shaft.pt.pin', measure: 'width',
    want: (s) => { const d = derive(s); return d.magA === 0 ? null : Math.abs(d.A.x) / d.magA * firstPiece(d.magA); } },
  { sel: 'line.shaft.pt.link', measure: 'height',
    want: (s) => { const d = derive(s); return d.magC === 0 ? null : Math.abs(d.C.y) / d.magC * firstPiece(d.magC); } }
];

// A force's label: its vector symbol, then its magnitude with a unit.
export function forceLabel(key, mag) {
  return [...symbolSegs(key), { t: ' ' + unitText(fmt(mag, FORCE_DP), 'N') }];
}

// A length in metres, as the figure prints it.
export function metreLabel(m) {
  return unitText(fmtFixed(m, DIM_DP), 'm');
}

// A box round a drawn shape, for labels to keep off.
const boxOf = (x0, y0, x1, y1) => ({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1) });
const circleBox = (c, r) => boxOf(c.x - r, c.y - r, c.x + r, c.y + r);

// A panel collects, as it draws: the boxes a label must keep off (`obs`) and the labels themselves
// (`items`). A pinned item is a text that will not move but still pushes the others away.
function sheet(svg, panel) {
  const obs = [], items = [], draws = [];
  return {
    obs, items,
    block(...boxes) { obs.push(...boxes); },
    // a text drawn now, at a place of its own, that other labels must avoid
    fixed(x, y, segs, opts = {}) {
      text(svg, x, y, segs, { size: opts.size || TEXT, sub: SUB, ...opts });
      items.push({ spot: { x, y, anchor: opts.anchor || 'start' }, chars: segPlain(segs).length, pinned: true });
    },
    // a label that is drawn at the end, once everything else is known, and may be nudged to fit.
    // `maxShift` caps how far: a point's name must stay beside its point, a force label may roam.
    moving(segs, spot, fill, opts = {}) {
      items.push({ spot, chars: segPlain(segs).length, pinned: false, maxShift: opts.maxShift });
      draws.push({ segs, fill, at: items.length - 1, weight: opts.weight || 600 });
    },
    // works out where the movable labels go, then draws them
    settle() {
      const placed = placeLabels(items, obs, panel.box);
      for (const d of draws) {
        const p = placed[d.at];
        text(svg, p.x, p.y, d.segs, { size: TEXT, sub: SUB, anchor: p.anchor, fill: d.fill, weight: d.weight });
      }
    }
  };
}

function heading(sh, x, y, str) {
  sh.fixed(x, y, str, { weight: 700, halo: false });
}

function rules(svg) {
  const line = (a) => el('line', { class: 'g sep', x1: a.x0 !== undefined ? a.x0 : a.x, y1: a.y0 !== undefined ? a.y0 : a.y,
    x2: a.x1 !== undefined ? a.x1 : a.x, y2: a.y1 !== undefined ? a.y1 : a.y, stroke: '#dde4ec', 'stroke-width': 2 }, svg);
  line(SPLITS.across);
  line(SPLITS.upper);
  line(SPLITS.lower);
}

// A dimension line with a tick at each end and its length above the middle.
function dimension(svg, sh, x0, x1, y, metres) {
  const g = el('g', { class: 'g dim' }, svg);
  el('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  for (const x of [x0, x1]) el('line', { x1: x, y1: y - 6, x2: x, y2: y + 6, stroke: COLORS.dim, 'stroke-width': 1.6 }, g);
  sh.block(boxOf(x0, y - 6, x1, y + 6));
  sh.fixed((x0 + x1) / 2, y - 16, metreLabel(metres), { anchor: 'middle', fill: COLORS.dim });
}

function beamRect(svg, sh, p) {
  el('rect', { class: 'g beam', x: p.A.x, y: p.A.y - 8, width: p.C.x - p.A.x, height: 16, rx: 3,
    fill: COLORS.beam, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  sh.block(boxOf(p.A.x, p.A.y - 8, p.C.x, p.A.y + 8));
}

// ---- panel 1: the situation (upper left) --------------------------------------------------------
function drawSpace(svg, s) {
  const P = PANELS.space;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  const D = linkEnd(P.baseY, P.baseX);
  heading(sh, P.headX, P.headY, 'The situation');
  sh.fixed(P.headX, P.headY + 20, 'drag the handle', { size: SUB, fill: COLORS.faint, halo: false });

  // the three-four-five slope, as two dashed legs with their real lengths
  el('line', { class: 'g slope', x1: p.C.x, y1: p.C.y, x2: D.x, y2: p.C.y, stroke: COLORS.faint, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, svg);
  el('line', { class: 'g slope', x1: D.x, y1: p.C.y, x2: D.x, y2: D.y, stroke: COLORS.faint, 'stroke-width': 1.5, 'stroke-dasharray': '6 5' }, svg);
  sh.fixed((p.C.x + D.x) / 2, p.C.y + 26, metreLabel(LINK_RUN_M), { anchor: 'middle', fill: COLORS.faint });
  sh.fixed(D.x + 8, D.y + 42, metreLabel(LINK_RISE_M), { anchor: 'start', fill: COLORS.faint });

  // the wall at D, the link, and the beam. The wall stands well clear of D so the rise label has room.
  const wx = D.x + 70;
  el('line', { class: 'g wall', x1: wx, y1: D.y - 48, x2: wx, y2: D.y + 48, stroke: COLORS.ink, 'stroke-width': 3 }, svg);
  hatch(svg, { x: wx, y: D.y - 44 }, { x: wx, y: D.y + 44 }, 1, -1, 6, 11, COLORS.wall);
  el('path', { class: 'g dsupport', d: `M${D.x} ${D.y} L${wx} ${D.y - 17} L${wx} ${D.y + 17} Z`, fill: COLORS.wall, stroke: COLORS.ink, 'stroke-width': 1.6 }, svg);
  el('line', { class: 'g link', x1: p.C.x, y1: p.C.y, x2: D.x, y2: D.y, stroke: COLORS.ink, 'stroke-width': 4 }, svg);
  sh.block(boxOf(wx, D.y - 48, wx + 12, D.y + 48), boxOf(D.x, D.y - 17, wx, D.y + 17), boxOf(p.C.x, p.C.y, D.x, D.y));
  beamRect(svg, sh, p);

  // the pin at A, the pin joints at C and D
  el('path', { class: 'g asupport', d: `M${p.A.x} ${P.baseY + 8} L${p.A.x - 21} ${P.baseY + 46} L${p.A.x + 21} ${P.baseY + 46} Z`, fill: COLORS.wall, stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
  hatch(svg, { x: p.A.x - 30, y: P.baseY + 46 }, { x: p.A.x + 30, y: P.baseY + 46 }, -1, 1, 5, 11, COLORS.wall);
  sh.block(boxOf(p.A.x - 30, P.baseY + 8, p.A.x + 30, P.baseY + 57));
  for (const q of [p.A, p.C, D]) {
    el('circle', { class: 'g pc', cx: q.x, cy: q.y, r: 5.5, fill: '#ffffff', stroke: COLORS.ink, 'stroke-width': 1.8 }, svg);
    sh.block(circleBox(q, 5.5));
  }

  // Point names. They may be nudged but not far: a letter that has wandered names nothing.
  const name = (x, y, t, anchor) => sh.moving(t, { x, y, anchor }, COLORS.ink, { weight: 700, maxShift: PLACE_NAME_SHIFT });
  name(p.A.x - 16, P.baseY - 20, 'A', 'end');
  name(p.C.x - 10, P.baseY - 20, 'C', 'end');
  name(D.x - 12, D.y - 12, 'D', 'end');
  // B is the one point name the load arrow and its handle can reach, so it is allowed to shift
  const bSpot = { x: p.B.x, y: P.dimY - 20, anchor: 'middle' };

  // the dimensions
  for (const q of [p.A, p.B, p.C]) {
    el('line', { class: 'g ext', x1: q.x, y1: P.baseY + 12, x2: q.x, y2: P.dimY + 8, stroke: COLORS.faint, 'stroke-width': 1.2, 'stroke-dasharray': '5 5' }, svg);
  }
  dimension(svg, sh, p.A.x, p.B.x, P.dimY, X1);
  dimension(svg, sh, p.B.x, p.C.x, P.dimY, X2);

  // the load, tip on B, tail as the handle
  const a = loadArrow(s, P.baseY, P.baseX);
  if (a) {
    sh.block(...arrow(svg, a.tail, a.tip, COLORS.load, 4.6, 'space load', HEAD_MAX));
    // Unlike the free-body panels, this label does NOT follow its arrow. The arrow swings through a
    // full circle about B and reaches most of the panel, so a label tied to it collides with the
    // beam, the link, the dimensions or a point's name depending on where the student drags. There is
    // only one force here and only one red arrow, so the label is better off in the corner, under the
    // heading, where it is always in the same place and always legible.
    sh.fixed(P.headX, P.headY + 48, forceLabel('load', derive(s).magB), { fill: COLORS.load, weight: 600 });
  }
  const h = a ? a.tail : { x: p.B.x, y: P.baseY - 46 };
  el('circle', { class: 'g handle load-handle', cx: h.x, cy: h.y, r: HANDLE_R, fill: '#ffffff', stroke: COLORS.load,
    'stroke-width': 3.2, tabindex: 0, role: 'slider', 'aria-label': 'Load arrow: drag it, or use the arrow keys' }, svg);
  sh.block(circleBox(h, HANDLE_R + 2));
  sh.moving('B', bSpot, COLORS.ink, { weight: 700, maxShift: PLACE_NAME_SHIFT });
  sh.settle();
}

// ---- panels 2 and 3: the two free-body diagrams -------------------------------------------------
function drawFbdArrows(svg, sh, arrows, cls) {
  for (const a of arrows) sh.block(...arrow(svg, a.tail, a.tip, COLOR_OF[a.cls], SHAFT, `${cls} ${a.cls}`, HEAD_MAX));
  for (const a of arrows) sh.moving(forceLabel(a.key, a.mag), labelSpot(a.tail, a.tip), COLOR_OF[a.cls]);
}

// The lower row, full width: the beam alone, with each force where it acts. The points are not named
// here on purpose -- an arrow may leave a point in any direction, so no fixed place for a letter is
// always clear of it, and each force's own subscript already names its point.
function drawExtended(svg, s) {
  const P = PANELS.ext;
  const sh = sheet(svg, P);
  const p = beamPoints(P.baseY, P.baseX);
  heading(sh, P.headX, P.headY, 'Free-body diagram of the beam');
  sh.fixed(P.headX, P.headY + 20, 'each support replaced by the force it applies', { size: SUB, fill: COLORS.faint, halo: false });
  beamRect(svg, sh, p);
  for (const q of [p.A, p.B, p.C]) {
    el('circle', { class: 'g dot', cx: q.x, cy: q.y, r: 4.5, fill: COLORS.ink }, svg);
    sh.block(circleBox(q, 4.5));
  }
  drawConcurrency(svg, sh, s);              // under the arrows, so the forces read first
  drawFbdArrows(svg, sh, fbdArrows(s, p.A, true), 'ext');
  sh.settle();
}

// The three lines of action, drawn from each force's point of application to the point they meet at.
// Each one is drawn as its separate dashes, not as one dashed line, for the same reason the arrows
// are cut into pieces: a single diagonal line claims its whole bounding rectangle, and these cross
// the panel. Nothing is drawn unless the meeting point is really on the panel; drawExtended's caller
// says nothing about it either, because the reading panel names the case instead.
function drawConcurrency(svg, sh, s) {
  const P = PANELS.ext;
  const con = concurrencyInPanel(s, P);
  if (!con) return;
  for (const line of concurrencyLines(s, P)) {
    for (const d of line.dashes) {
      el('line', { class: 'g loa', x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2,
        stroke: COLORS.faint, 'stroke-width': 1.6, 'stroke-linecap': 'butt' }, svg);
      sh.block(boxOf(d.x1, d.y1, d.x2, d.y2));
    }
  }
  el('circle', { class: 'g concur', cx: con.at.x, cy: con.at.y, r: CONCUR_R,
    fill: '#ffffff', stroke: COLORS.dim, 'stroke-width': 2 }, svg);
  // A wide berth, not just the circle: a label that lands beside the meeting point reads as if it
  // were naming it, and the point is the one thing in this panel that has no label of its own.
  sh.block(circleBox(con.at, CONCUR_R + 18));
}

// The upper right: the same forces, all from one point.
function drawPoint(svg, s) {
  const P = PANELS.point;
  const sh = sheet(svg, P);
  const o = { x: P.ox, y: P.oy };
  heading(sh, P.headX, P.headY, 'The beam as a single point');
  el('circle', { class: 'g dot origin', cx: o.x, cy: o.y, r: 7, fill: COLORS.ink }, svg);
  sh.block(circleBox(o, 7));
  drawFbdArrows(svg, sh, fbdArrows(s, o, false), 'pt');
  sh.settle();
}

// ---- panel 4: the three forces tip to tail ------------------------------------------------------
function drawPolygon(svg, s) {
  const P = PANELS.poly;
  const sh = sheet(svg, P);
  const d = derive(s);
  heading(sh, P.headX, P.headY, 'The forces tip to tail');
  if (d.magB === 0) {
    sh.fixed((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 'No load, so there is nothing to add up.',
      { size: SUB, anchor: 'middle', fill: COLORS.faint, italic: true });
    return;
  }
  const verts = polygonVertices(s);
  const fit = fitPolygon(verts, P);
  const order = ['load', 'link', 'pin'];
  const mags = { load: d.magB, link: d.magC, pin: d.magA };
  const drawn = [];
  for (let i = 0; i < order.length; i++) {
    const from = fit.map(verts[i]), to = fit.map(verts[i + 1]);
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) continue;    // a force of zero adds no side
    sh.block(...arrow(svg, from, to, COLOR_OF[order[i]], SHAFT, `poly ${order[i]}`, HEAD_MAX));
    drawn.push({ key: order[i], from, to });
  }

  // a scale bar, because this panel is fitted to the shape and the others are not
  const barN = 20, bar = barN * fit.scale;
  const by = P.y1 + 8;
  el('line', { class: 'g scalebar', x1: P.x0, y1: by, x2: P.x0 + bar, y2: by, stroke: COLORS.faint, 'stroke-width': 3 }, svg);
  sh.block(boxOf(P.x0, by - 2, P.x0 + bar, by + 2));
  sh.fixed(P.x0 + bar + 7, by + 6, unitText(fmt(barN, 0), 'N'), { size: SUB, anchor: 'start', fill: COLORS.faint });

  const spots = polygonLabelSpots(drawn);
  drawn.forEach((sd, i) => sh.moving(forceLabel(sd.key, mags[sd.key]), spots[i], COLOR_OF[sd.key]));
  sh.settle();
}

// ---- the whole figure ---------------------------------------------------------------------------
export function createScene(svg) {
  return {
    render(s) {
      clear(svg);
      rules(svg);
      drawSpace(svg, s);
      drawExtended(svg, s);
      drawPoint(svg, s);
      drawPolygon(svg, s);
    }
  };
}

export { segPlain };
