import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, linkForce, linkSense, loadComponents, cosDeg, sinDeg,
         X1, X2, SPAN, LINK_UX, LINK_UY } from '../src/physics.js';
import { STATES } from './grid.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);

test('the geometry is the figure: x1 = 3 m, x2 = 2 m, and a 3-4-5 link', () => {
  assert.equal(X1, 3);
  assert.equal(X2, 2);
  assert.equal(SPAN, 5);
  near(LINK_UX, 0.8);
  near(LINK_UY, 0.6);
  near(LINK_UX * LINK_UX + LINK_UY * LINK_UY, 1);     // it really is a unit vector
});

test('cosDeg and sinDeg are EXACT at the quadrant points, where Math.cos is not', () => {
  assert.equal(cosDeg(270), 0);
  assert.equal(sinDeg(180), 0);
  assert.equal(cosDeg(0), 1);
  assert.equal(cosDeg(180), -1);
  assert.equal(sinDeg(90), 1);
  assert.equal(sinDeg(270), -1);
  assert.notEqual(Math.cos(270 * Math.PI / 180), 0);  // the bug this guards against
  // and they still agree with Math away from those points
  near(cosDeg(35), Math.cos(35 * Math.PI / 180));
  near(sinDeg(215), Math.sin(215 * Math.PI / 180));
  // 0 and 360 are the same load
  assert.equal(cosDeg(360), cosDeg(0));
  assert.equal(sinDeg(360), sinDeg(0));
});

test('the default load, 50 N straight down: hand-derived', () => {
  // F_B = (0, -50). sum M_A: 3(-50) + 5(0.6 F_CD) = 0 -> F_CD = 150/3 = +50 N, tension.
  // F_Ax = -0 - 0.8(50) = -40 N. F_Ay = +50 - 0.6(50) = +20 N. F_A = sqrt(1600+400) = 44.721 N.
  const d = derive({ f: 50, dir: 270 });
  assert.deepEqual(d.B, { x: 0, y: -50 });
  near(d.cd, 50);
  assert.equal(linkSense(d.cd), 'tension');
  near(d.C.x, 40);
  near(d.C.y, 30);
  near(d.A.x, -40);
  near(d.A.y, 20);
  near(d.magA, Math.sqrt(2000));
  near(d.magA, 44.7213595, 1e-7);
});

test('a load along the beam leaves the link carrying nothing', () => {
  for (const dir of [0, 180, 360]) {
    const d = derive({ f: 80, dir });
    assert.equal(d.cd, 0, `dir ${dir}`);
    assert.equal(linkSense(d.cd), 'none');
    assert.equal(d.A.x, -d.B.x, `dir ${dir}`);        // the pin alone balances the load
    assert.equal(d.A.y, 0, `dir ${dir}`);
  }
});

test('an upward load puts the link into compression, a downward one into tension', () => {
  assert.equal(linkSense(derive({ f: 40, dir: 90 }).cd), 'compression');
  assert.equal(linkSense(derive({ f: 40, dir: 270 }).cd), 'tension');
  assert.equal(linkSense(derive({ f: 40, dir: 225 }).cd), 'tension');   // any downward component
  assert.equal(linkSense(derive({ f: 40, dir: 45 }).cd), 'compression');
});

test('no load means no forces at all', () => {
  const d = derive({ f: 0, dir: 215 });
  for (const v of [d.B.x, d.B.y, d.C.x, d.C.y, d.A.x, d.A.y, d.cd, d.magA, d.magB, d.magC]) {
    assert.equal(v, 0);
  }
  assert.equal(linkSense(d.cd), 'none');
});

test('the load is linear in its magnitude', () => {
  const one = derive({ f: 20, dir: 215 });
  const two = derive({ f: 40, dir: 215 });
  near(two.cd, 2 * one.cd);
  near(two.magA, 2 * one.magA);
});

test('EVERY state of the grid is in equilibrium: the three forces sum to zero', () => {
  for (const s of STATES) {
    const d = derive(s);
    near(d.A.x + d.B.x + d.C.x, 0, 1e-12);
    near(d.A.y + d.B.y + d.C.y, 0, 1e-12);
    // and the moment about A, and about C, both vanish
    near(X1 * d.B.y + SPAN * d.C.y, 0, 1e-12);
    near(-SPAN * d.A.y - X2 * d.B.y, 0, 1e-12);
  }
});

test('the link force really is along r_CD, and magC is its length', () => {
  for (const s of STATES) {
    const d = derive(s);
    near(d.C.x, LINK_UX * d.cd, 1e-12);
    near(d.C.y, LINK_UY * d.cd, 1e-12);
    near(d.magC, Math.hypot(d.C.x, d.C.y), 1e-12);
    near(d.magC, Math.abs(d.cd), 1e-12);
  }
});

test('the three lines of action are concurrent wherever all three forces exist', () => {
  // Three non-parallel forces on a rigid body in equilibrium must meet at one point -- which is the
  // same fact as the force polygon closing. F_B acts at (x1, 0) along B; F_CD acts at (SPAN, 0) along C.
  // Their crossing P must also lie on F_A's line of action, which runs through the pin at the origin.
  let checked = 0;
  for (const s of STATES) {
    if (s.f === 0) continue;                                   // no forces, no lines
    const d = derive(s);
    const den = d.C.x * d.B.y - d.C.y * d.B.x;                 // zero when F_B and F_CD are parallel
    if (Math.abs(den) < 1e-6 * d.magB * Math.max(d.magC, 1)) continue;
    const t = (X1 - SPAN) * d.B.y / den;
    const P = { x: SPAN + d.C.x * t, y: d.C.y * t };
    const cross = P.x * d.A.y - P.y * d.A.x;                   // P, the origin and F_A are collinear
    near(cross / (Math.hypot(P.x, P.y) * Math.max(d.magA, 1e-9)), 0, 1e-9);
    checked++;
  }
  assert.ok(checked > 250, `only ${checked} states were non-degenerate; the test is close to vacuous`);
});

test('the crossing point sits under B at the depth the load direction demands', () => {
  // Only a VERTICAL load has its line of action straight under B; this is that case, hand-derived.
  // F_CD's line is y = 0.75(x - 5); at x = 3 that is y = -1.5 m, so the three forces meet 1.5 m below B.
  const d = derive({ f: 50, dir: 270 });
  const t = (X1 - SPAN) * d.B.y / (d.C.x * d.B.y - d.C.y * d.B.x);
  near(SPAN + d.C.x * t, 3);
  near(d.C.y * t, -1.5);
});

test('the whole grid stays inside the 1.0 unit per newton drawing budget', () => {
  let max = 0;
  for (const s of STATES) {
    const d = derive(s);
    max = Math.max(max, d.magA, d.magB, d.magC);
  }
  assert.ok(max < 105, `the longest arrow is ${max.toFixed(2)} units, which must stay under 105`);
  assert.ok(max > 100, `expected the worst case near 104.5, got ${max.toFixed(2)}`);
});

test('loadComponents and linkForce never return negative zero', () => {
  for (const s of STATES) {
    const B = loadComponents(s);
    assert.ok(!Object.is(B.x, -0) && !Object.is(B.y, -0), JSON.stringify(s));
    assert.ok(!Object.is(linkForce(s), -0), JSON.stringify(s));
    const d = derive(s);
    for (const v of [d.A.x, d.A.y, d.C.x, d.C.y]) assert.ok(!Object.is(v, -0), JSON.stringify(s));
  }
});
