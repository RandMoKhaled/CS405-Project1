
/**
 * Curve export — Part D.
 *
 * Required JSON format (control points in NORMALISED painting coordinates:
 * u, v ∈ [0, 1], origin at the TOP-LEFT corner of the painting, v downwards,
 * the same as texture coordinates):
 *
 * {
 *   "painting": "kavunlu",
 *   "kind": "bezier-c1",                 // or "catmull-rom" / "bspline"
 *   "segments": [                          // for "bezier-c1": 4 points each
 *     [[0.12, 0.40], [0.18, 0.31], [0.27, 0.30], [0.33, 0.38]],
 *     ...
 *   ],
 *   "points": [[u, v], ...]                // for "catmull-rom" / "bspline"
 * }
 *
 * The painting quad spans x ∈ [−a, a], y ∈ [−1, 1] at z = 0 (a = image
 * width / height), so  u = (x + a) / (2a)  and  v = (1 − y) / 2.
 */

/** TODO (Part D): build the object above from your curve data. */
export function curveToJSON(curve) {
  const { painting, kind, aspect, segments = [], points = [] } = curve;

  const normalize = p => [
    Math.max(0, Math.min(1, (p[0] + aspect) / (2 * aspect))),
    Math.max(0, Math.min(1, (1 - p[1]) / 2)),
  ];

  if (kind === 'bezier-c1') {
    return {
      painting,
      kind,
      segments: segments.map(s => s.map(normalize)),
    };
  }

  return {
    painting,
    kind,
    points: points.map(normalize),
  };
}

/** Provided: save any object as a .json download in the browser. */
export function downloadJSON(obj, filename = 'curve.json') {
  const blob = new Blob(
    [JSON.stringify(obj, null, 2)],
    { type: 'application/json' }
  );

  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
