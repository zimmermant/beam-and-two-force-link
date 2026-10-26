import test from 'node:test';
import assert from 'node:assert/strict';
import { calcLines } from '../src/panel.js';
import { NUMBER } from './unit-rule.js';
import { unfmt } from '../src/format.js';
import { STATES } from './grid.js';
import { derive, FORCE_DP, LINK_UX, LINK_UY, cosDeg, sinDeg } from '../src/physics.js';

// This page prints no arithmetic -- no "a + b = c" line a reader could check with a calculator -- so the
// kit's relation table has nothing to hold. What it DOES claim, in a picture rather than a formula, is
// that the three forces add to zero: the polygon closes. That claim is made at the PRINTED precision,
// because the magnitudes beside the arrows are rounded to FORCE_DP decimals, and it is the one that can
// quietly stop being true if the decimals are cut.
//
// So this file checks the printed numbers the way a student with a protractor and a calculator would:
// rebuild each force from the MAGNITUDE AS PRINTED and its exact direction, add the three, and demand the
// residual stay inside what rounding alone can explain.

const plain = (html) => html.replace(/<[^>]*>/g, '');
const LAST_DIGIT = 10 ** -FORCE_DP;

// The printed magnitudes of the reading line, in the order load, link, pin.
function printedMagnitudes(s) {
  const read = calcLines(s).find(l => l.key === 'read');
  return (plain(read.html).match(NUMBER) || []).map(unfmt);
}

test('the three printed magnitudes rebuild three forces that still add to zero', () => {
  let checked = 0;
  for (const s of STATES) {
    if (s.f === 0) continue;
    const d = derive(s);
    const [mB, mC, mA] = printedMagnitudes(s);
    assert.ok(Number.isFinite(mB) && Number.isFinite(mC) && Number.isFinite(mA), JSON.stringify(s));

    // each force's exact direction, as the figure draws it, times the magnitude the page prints
    const sign = Math.sign(d.cd) || 0;
    const unit = (v, m) => (m > 0 ? { x: v.x / m, y: v.y / m } : { x: 0, y: 0 });
    const B = { x: mB * cosDeg(s.dir), y: mB * sinDeg(s.dir) };
    const C = { x: mC * sign * LINK_UX, y: mC * sign * LINK_UY };
    const uA = unit(d.A, d.magA);
    const A = { x: mA * uA.x, y: mA * uA.y };

    const residual = Math.hypot(B.x + C.x + A.x, B.y + C.y + A.y);
    // Three magnitudes, each rounded by at most half a last digit: 1.5 last digits is the worst case.
    assert.ok(residual <= 1.5 * LAST_DIGIT + 1e-9,
      `${JSON.stringify(s)}: the printed magnitudes leave the polygon ${residual.toFixed(4)} N open, more than rounding can explain`);
    checked++;
  }
  assert.ok(checked > 300, `only ${checked} states were checked; the test is close to vacuous`);
});

test('each printed magnitude is the exact one, rounded to the decimals the page uses', () => {
  for (const s of STATES) {
    if (s.f === 0) continue;
    const d = derive(s);
    const got = printedMagnitudes(s);
    const want = [d.magB, d.magC, d.magA].map(m => Number(m.toFixed(FORCE_DP)));
    assert.deepEqual(got, want, JSON.stringify(s));
  }
});

test('FORCE_DP is not more than the page can honestly carry, and not so few that the closure test is empty', () => {
  // One decimal on a force up to about 104 N: at most 0.05 N of rounding per arrow. Cutting to whole
  // newtons would make the worst residual 1.5 N, which a student WOULD notice on the polygon.
  assert.ok(FORCE_DP >= 1, 'fewer decimals than this and the closed polygon stops closing at the printed precision');
  let worst = 0;
  for (const s of STATES) {
    if (s.f === 0) continue;
    const d = derive(s);
    for (const m of [d.magB, d.magC, d.magA]) worst = Math.max(worst, Math.abs(m - Number(m.toFixed(FORCE_DP))));
  }
  assert.ok(worst > 0, 'no state rounds at all: the decimals say nothing and this test is vacuous');
  assert.ok(worst <= 0.5 * LAST_DIGIT + 1e-9, `a printed magnitude is off by ${worst}`);
});
