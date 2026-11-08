/**
 * mat4 — 4×4 matrices for Parts A and C.
 *
 * CONVENTIONS (the tests check exactly these):
 *   • A matrix is a Float32Array(16) in COLUMN-MAJOR order — the layout WebGPU
 *     expects for a mat4x4f in a uniform buffer. Element (row r, column c)
 *     lives at index  c * 4 + r.  The translation of an affine matrix is
 *     therefore at indices 12, 13, 14.
 *   • Column vectors: a point p is transformed as  M · p.
 *     multiply(A, B) returns A·B, so B is applied FIRST.
 *   • Right-handed world space. Angles in RADIANS. A positive angle rotates
 *     counter-clockwise when you look down the axis towards the origin
 *     (rotateZ(π/2) takes +x to +y).
 *   • View space: the camera sits at the origin and looks down −z, +y is up.
 *   • Clip space is WebGPU's: after the divide by w, x and y are in [−1, 1]
 *     and z is in [0, 1] (near → 0, far → 1). NOT OpenGL's [−1, 1].
 *
 * No maths libraries (no gl-matrix, no Three.js). Tests: tests/mat4.test.js
 */
import { todo } from './todo.js';
import * as vec3 from './vec3.js';

/* ------------------------------------------------------------- Part A ---- */

export function identity() {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** A · B (apply B first, then A). Must not modify a or b. */
//Taken and adapted from Lab2-mat3.js
export function multiply(a, b) { 
  const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += a[4 * k + r] * b[4 * c + k];
        }
        out[4 * c + r] = sum;
      }
   }
  return out;
}

/** Translation by (tx, ty, tz). */
export function translate(tx, ty, tz) { 
  const out = identity();
  out[12] = tx;
  out[13] = ty;
  out[14] = tz;

  return out;
}

/** Rotation by `rad` about the x axis. */
//Taken and adapted from Lab3-mat4.js
export function rotateX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

/** Rotation by `rad` about the y axis. */
//Taken and adapted from Lab3-mat4.js
export function rotateY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

/** Rotation by `rad` about the z axis. */
//Taken and adapted from Lab3-mat4.js
export function rotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

/** Non-uniform scale by (sx, sy, sz). */
//Taken and adapted from lab2-mat3.js
export function scale(sx, sy, sz) {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    0, 0, 0, 1,
  ]);
}

/** Mᵀ */
//Taken and adapted from week4 demo w4lib.js
export function transpose(m) { 
  const out = new Float32Array(16); 
  for (let c = 0; c < 4; c++) 
    for (let r = 0; r < 4; r++) out[4*r+c] = m[4*c+r]; 
  
  return out;
 }

/**
 * Inverse of a RIGID transform M = T·R (rotation + translation only, no scale).
 * Do not write a general 4×4 inverse: use the structure (Week 3).
 */
export function invertRigid(m) { 
  const out = identity();

  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) {
      out[4*c+r] = m[4*r+c];
    }
  }

  const inverseTranslation = translate(-m[12], -m[13], -m[14]);
  
  return( multiply(out, inverseTranslation));
}

/** M · v for a 4-component v = [x, y, z, w]; returns [x', y', z', w']. */
//Logic from lectures and functiones from the ones previously coded
export function transformVec4(m, v) { 
  const out = new Float32Array(4);
  for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let c = 0; c < 4; c++) {
      sum += m[4 * c + r] * v[c];
    }
    out[r] = sum;
  }
  return out;
}

/* ------------------------------------------------------------- Part C ---- */

/**
 * View matrix for a camera at `eye` looking at `target`, with `up` as the
 * approximate up direction. Build the camera basis with two cross products.
 * Must stay finite when `up` is parallel to the view direction — handle it.
 * eye, target, up: [x, y, z]
 */

// Vector operations from vec3.js (Week 1); camera basis from Lab 3.
const { sub, cross, dot, normalize: norm } = vec3;

export function lookAt(eye, target, up = [0, 1, 0]) {
  const w = norm(sub(eye, target));
  let uRaw = cross(up, w);
  // degenerate case: up is parallel to the view direction → cross product is zero
  // Adapted from Lab3-mat4.js for the project's degenerate camera test
  if (Math.hypot(...uRaw) < 1e-6) {
    uRaw = cross(Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1], w);
  }
  const u = norm(uRaw);
  const v = cross(w, u);
  return new Float32Array([
    u[0], v[0], w[0], 0,
    u[1], v[1], w[1], 0,
    u[2], v[2], w[2], 0,
    -dot(u, eye), -dot(v, eye), -dot(w, eye), 1,
  ]);
}


/**
 * Perspective projection for WebGPU (depth z ∈ [0, 1]).
 * fovY: vertical field of view in radians; aspect = width / height;
 * near, far: positive distances along −z.
 */
export function perspective(fovYRadians, aspect, near, far) {
  const f = 1 / Math.tan(fovYRadians / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ]);
}

/**
 * Orthographic projection for WebGPU (depth z ∈ [0, 1]) of the box
 * x ∈ [left, right], y ∈ [bottom, top], z ∈ [−near, −far] in view space.
 */

// Taken and adapted from Week 4 demo w4lib.js
export function orthographic(left, right, bottom, top, near, far) {
  return new Float32Array([
    2/(right-left),0,0,0,
    0,2/(top-bottom),0,0,
    0,0,1/(near-far),0,
    -(right+left)/(right-left),
    -(top+bottom)/(top-bottom),
    near/(near-far),
    1
  ]);
}


/* ------------------------------------------------- provided (not graded) - */

/**
 * Pretty-print a column-major matrix as four rows, for showing matrices on
 * screen (Part A asks you to display T·R·S and S·R·T).
 */
export function format(m, digits = 2) {
  if (!m) return '(none)';
  const w = digits + 4;
  let s = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) s += (+m[c * 4 + r]).toFixed(digits).padStart(w);
    if (r < 3) s += '\n';
  }
  return s;
}
