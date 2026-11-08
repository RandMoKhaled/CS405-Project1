
/**
 * curves — Part D.
 *
 * Points are plain arrays of any dimension: [x, y] in the plane of the
 * painting, or [x, y, z] in world space. Every function must work for both
 * (the tests use 2D and 3D). Return new arrays; never modify the inputs.
 *
 * A piecewise cubic Bézier curve is an array of segments, each segment being
 * four control points [P0, P1, P2, P3]. Consecutive segments share a joint:
 * segments[i][3] equals segments[i + 1][0].
 *
 * Tests: tests/curves.test.js
 */
import { todo } from './todo.js';

/* ---------------------------------------------------------- Bézier ------ */

/** The four cubic Bernstein basis values [B0(t), B1(t), B2(t), B3(t)]. */
export function bernstein3(t) {
  const u = 1 - t;

  return [
    u * u * u,
    3 * u * u * t,
    3 * u * t * t,
    t * t * t
  ];
}

/** Point on the cubic Bézier curve with control points p0..p3 at t ∈ [0, 1]. */
export function cubicBezier(p0, p1, p2, p3, t) {
  const b = bernstein3(t);
  const result = [];

  for (let i = 0; i < p0.length; i++) {
    result.push(
      b[0] * p0[i] +
      b[1] * p1[i] +
      b[2] * p2[i] +
      b[3] * p3[i]
    );
  }

  return result;
}

/** First derivative dB/dt of the cubic Bézier at t (not normalised). */
export function cubicBezierTangent(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const result = [];

  for (let i = 0; i < p0.length; i++) {
    result.push(
      3 * u * u * (p1[i] - p0[i]) +
      6 * u * t * (p2[i] - p1[i]) +
      3 * t * t * (p3[i] - p2[i])
    );
  }

  return result;
}

/**
 * de Casteljau's construction for any number of control points.
 * Returns every level, for drawing the construction:
 *   levels[0] = the input points (n points)
 *   levels[1] = n − 1 interpolated points
 *   …
 *   levels[n − 1] = [the point on the curve]
 */
export function deCasteljau(points, t) {
  const levels = [points.map(p => [...p])];

  while (levels[levels.length - 1].length > 1) {
    const previous = levels[levels.length - 1];
    const next = [];

    for (let i = 0; i < previous.length - 1; i++) {
      const point = [];

      for (let j = 0; j < previous[i].length; j++) {
        point.push(
          (1 - t) * previous[i][j] +
          t * previous[i + 1][j]
        );
      }

      next.push(point);
    }

    levels.push(next);
  }

  return levels;
}

/* ----------------------------------------------- piecewise, C¹ joints --- */

/**
 * Given the last two control points P2, P3 of one segment, return the P1 of
 * the NEXT segment that makes the joint at P3 C¹-continuous.
 */
export function c1NextControl(p2, p3) {
  const result = [];

  for (let i = 0; i < p2.length; i++) {
    result.push(2 * p3[i] - p2[i]);
  }

  return result;
}

/**
 * Evaluate a piecewise cubic Bézier at a global parameter u ∈ [0, 1] that
 * runs over the whole curve: with n segments, segment i covers
 * u ∈ [i/n, (i+1)/n]. u = 0 is the first P0, u = 1 the last P3.
 */
export function evalPiecewise(segments, u) {
  const n = segments.length;

  if (n === 0) {
    return [];
  }

  const clampedU = Math.max(0, Math.min(1, u));
  const scaledU = clampedU * n;

  const index = Math.min(Math.floor(scaledU), n - 1);
  const t = scaledU - index;

  const segment = segments[index];

  return cubicBezier(
    segment[0],
    segment[1],
    segment[2],
    segment[3],
    t
  );
}

/* ---------------------------- second curve family: implement ONE -------- */
/* The tests skip whichever of the two you leave as a TODO, and fail only   */
/* if you implement neither.                                                */

/**
 * Uniform Catmull–Rom: the segment between p1 and p2 (passes through both),
 * t ∈ [0, 1], with tangents (p2 − p0)/2 at p1 and (p3 − p1)/2 at p2.
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const result = [];

  for (let i = 0; i < p0.length; i++) {
    result.push(
      0.5 * (
        2 * p1[i] +
        (-p0[i] + p2[i]) * t +
        (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 +
        (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3
      )
    );
  }

  return result;
}

/** Uniform cubic B-spline basis values [N0(t), N1(t), N2(t), N3(t)]. */
export function bsplineBasis(t) {
  const u = 1 - t;
  const t2 = t * t;
  const t3 = t2 * t;

  return [
    (u * u * u) / 6,
    (3 * t3 - 6 * t2 + 4) / 6,
    (-3 * t3 + 3 * t2 + 3 * t + 1) / 6,
    t3 / 6
  ];
}

/** Point on the uniform cubic B-spline segment controlled by p0..p3. */
export function bspline(p0, p1, p2, p3, t) {
  const b = bsplineBasis(t);
  const result = [];

  for (let i = 0; i < p0.length; i++) {
    result.push(
      b[0] * p0[i] +
      b[1] * p1[i] +
      b[2] * p2[i] +
      b[3] * p3[i]
    );
  }

  return result;
}
