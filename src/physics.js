// The statics: pure functions of the stored inputs, no DOM.
//
// Beam A-C, rigid and weightless, lying along +x. A is a PIN (two unknown components). C is pinned to
// link CD, a two-force member running up-and-right to a wall pin at D on a 3-4-5 slope. The student sets
// one load F_B at B: its magnitude `f` and its direction `dir`, measured CCW from +x, so straight down
// is 270 degrees.
//
// NOTATION (Todd's rule): a force is never named after a point. The load is F_B, the pin reaction is
// F_A with components F_Ax and F_Ay, and the link force is F_CD, a SIGNED scalar along the unit vector
// r_CD from C toward D. Positive F_CD pulls the beam toward D (tension); negative pushes (compression).
//
// Axes: x right, y up, moments CCW positive.
//
//   sum M_A = 0:   x1 F_By + L (0.6 F_CD) = 0     ->  F_CD = - x1 F_By / (0.6 L)
//   sum F_x = 0:   F_Ax + F_Bx + 0.8 F_CD = 0     ->  F_Ax = - F_Bx - 0.8 F_CD
//   sum F_y = 0:   F_Ay + F_By + 0.6 F_CD = 0     ->  F_Ay = - F_By - 0.6 F_CD

export const DEG = Math.PI / 180;

export const X1 = 3;                 // m, A to B
export const X2 = 2;                 // m, B to C
export const SPAN = X1 + X2;         // m, A to C
export const LINK_RUN = 4;           // the slope triangle drawn on the figure
export const LINK_RISE = 3;
export const LINK_UX = LINK_RUN / 5; // r_CD, the unit vector from C toward D
export const LINK_UY = LINK_RISE / 5;

export const FORCE_DP = 1;           // decimals printed for every force magnitude

// The subscript of each force's name, in the order the figure introduces them. ONE source of truth: the
// figure draws these as lowered tspans and the reading panel as <sub> elements, so the two can never
// drift apart, and neither can ever print an ASCII underscore. A force is never named after a point:
// the load is F_B, not B, and the pin reaction is F_A, not A.
export const FORCE_SUB = { load: 'B', link: 'CD', pin: 'A' };

// cos and sin of a whole number of degrees, EXACT at the quadrant points. Math.cos(270 * DEG) is
// -1.8e-16, not 0, which would leave a hair of link force at a load that is exactly vertical and a hair
// of vertical load at one that is exactly horizontal. The sliders step by 5 degrees, so every quadrant
// point is reachable and must be exact.
export function cosDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 90 || m === 270) return 0;
  if (m === 0) return 1;
  if (m === 180) return -1;
  return Math.cos(m * DEG);
}

export function sinDeg(d) {
  const m = ((d % 360) + 360) % 360;
  if (m === 0 || m === 180) return 0;
  if (m === 90) return 1;
  if (m === 270) return -1;
  return Math.sin(m * DEG);
}

// The applied load as components, in newtons. Adding 0 turns -0 into 0.
export function loadComponents(s) {
  return { x: s.f * cosDeg(s.dir) + 0, y: s.f * sinDeg(s.dir) + 0 };
}

// The signed force in link CD, along r_CD. Moment about A kills both pin components.
export function linkForce(s) {
  return -X1 * loadComponents(s).y / (LINK_UY * SPAN) + 0;
}

// Everything that is shown but not stored.
export function derive(s) {
  const B = loadComponents(s);
  const cd = linkForce(s);
  const C = { x: LINK_UX * cd + 0, y: LINK_UY * cd + 0 };     // what the link does to the beam, at C
  const A = { x: -B.x - C.x + 0, y: -B.y - C.y + 0 };         // what the pin does to the beam, at A
  return {
    B, C, A, cd,
    magB: Math.hypot(B.x, B.y),
    magC: Math.abs(cd),
    magA: Math.hypot(A.x, A.y)
  };
}

// 'tension' when the link pulls the beam toward D, 'compression' when it pushes, 'none' at zero.
export function linkSense(cd) {
  if (cd > 0) return 'tension';
  if (cd < 0) return 'compression';
  return 'none';
}
