# CS405 Project 1 — Transformations, Projection & Curves from Paintings

WebGPU implementation of Parts A–E, using the course's starter renderer and the Week 1–4 labs/demos as the foundation. Default painting: **Şeker Ahmed Paşa, *Kavunlu Natürmort*** (Sakıp Sabancı Museum collection, as supplied in the course starter).

## Run

Requires Node.js 20.19+ and a browser with WebGPU enabled (recent Chrome or Edge on Windows).

```bash
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). To test the math and scene graph:

```bash
npm test
npm run build
```

The tests cover `vec3.js`, `mat4.js`, `node.js` and `curves.js`. Do not upload `node_modules` or `dist` to GitHub; they are generated locally.

## Controls

| Panel | Control | Effect |
| --- | --- | --- |
| Painting | Painting | Switch between the supplied museum images. The **default curve is fitted only approximately to Kavunlu**; edit it for another image. |
| Camera | View | Main camera or fixed inspection camera (shows the main camera frustum). Editing/orbiting are disabled in inspection view to avoid selecting points with the wrong camera. |
| Camera | Projection | Perspective or orthographic (main camera). |
| Camera | fovY (degrees) | Vertical perspective field of view, from Week 4. |
| Camera | near / far | Main camera clipping planes and depth range; observe the effect in inspection view. |
| Canvas | Left drag | Orbit main camera (when curve editing is off). |
| Canvas | Mouse wheel | Zoom main camera. |
| Scene | Debug axes | Display world-aligned XYZ axes (red/green/blue). |
| Part A | Translate X/Y/Z | Translate the blue cube's local transform; its children inherit the transformation. |
| Part A | Rotate X/Y/Z | Rotate the blue cube's local transform, radians. |
| Part A | Scale X/Y/Z | Scale the blue cube's local transform. |
| Part A | T·R·S order | Switch between `T · R · S` and `S · R · T` and compare both displayed matrices. |
| Part D | t | De Casteljau parameter on the **first** cubic Bézier segment. |
| Part D | Show Catmull-Rom | Overlay a cyan interpolating curve through the four anchors. |
| Part D | Show construction | Show de Casteljau intermediate lines and moving point on segment one. |
| Part D | Animate along curve | Animate a tangent-oriented yellow triangle across all three segments. |
| Part D | Edit control points | Left-drag a yellow handle. Shift+click moves the nearest editable handle. Derived C¹ handles are displayed but are not independently editable. |
| Part D | Export curve JSON | Download three Bézier segments in normalized painting coordinates. |
| View | Reset | Restore camera/orbit, projection dropdown and camera sliders, objects and curve control points. |

## Parts and mathematical conventions

- **Part A:** Three instanced cubes use the Lab 3 camera uniform and storage-buffer node layout. `mat4.js` stores column-major matrices and uses column vectors. Both `T·R·S` and `S·R·T` are displayed for comparison.
- **Part B:** Hierarchy `root → blue → {pink, greenGroup → green}`. The green group rotates. World matrices are computed with `SceneNode.updateWorld()`; children inherit their parent's transform. Debug axes are attached to the unscaled root for clear orientation.
- **Part C:** `viewProjection()` composes `P · V`; `lookAt` follows the two-cross-products approach in the lecture, and projections use WebGPU depth `z ∈ [0,1]`. Orbiting follows Week 4 `w4lib.js`. The inspection camera draws the main camera's near/far frustum.
- **Part D:** Three cubic Bézier segments with C¹ joints; `P1(next) = 2·P3(previous) − P2(previous)`. The actual rendering uses **the tested functions in `src/math/curves.js`**, including `cubicBezier`, `cubicBezierTangent`, `deCasteljau`, `c1NextControl` and `catmullRom`. The initial control points approximate the **upper melon rind** in the default painting; refine them visually using edit mode. Exported `kavunlu-curve.json` contains this **initial approximate trace**; re-export after edits to save the final trace.
- **Part E:** The supplied statistics panel displays frame time, draw calls and submitted vertices. The renderer is the starter's WebGPU implementation.

### JSON coordinates

`kavunlu-curve.json` is included at the repository root. It is an initial approximate trace, not a claim of pixel-accurate tracing. The exported format is `{ "painting": "kavunlu", "kind": "bezier-c1", "segments": [...] }`; each segment has four `[u,v]` points, normalized to `[0,1]` relative to the painting, with `(0,0)` at the upper left. For your final hand-traced shape, adjust the handles and click **Export curve JSON**, then replace the included file with the download.

## Lab/lecture provenance and AI disclosure

The course starter provides `render/`, `ui/`, `geometry.js`, and the painting assets. The matrix multiplication pattern derives from Lab 2; 4×4 rotations, storage-buffer instancing and WGSL shader layout derive from Lab 3; camera orbit, view/projection and frustum visualization derive from Week 4 demos. Vector arithmetic derives from Week 1 linear algebra. Bézier/C¹/Catmull–Rom formulas correspond to Part D and the upcoming curves lecture. See in-code comments.

**AI-assisted changes (document accurately in the report):** ChatGPT helped integrate Part D, debug WebGPU rendering, implement and reuse `vec3.js` / `curves.js`, correct camera reset and inspection input, add projection sliders, draft documentation and generate an initial approximate melon-rind control-point trace. The student must review, test in the browser, understand the math and disclose AI assistance according to the updated course rules. This README is not a substitute for the required report/appendix.

## Final submission checklist

- [ ] Inspect the app in a WebGPU-enabled browser, including both projections and the inspection frustum.
- [ ] Manually trace the desired painting contour, export JSON and replace the initial approximate file.
- [ ] Capture screenshots and measured frame times/GPU model for the report.
- [ ] Show one manually calculated Part B world matrix and Part C projection derivation.
- [ ] Include a 3–5-page `report.pdf` and AI-use disclosure as required by the handout.
- [ ] Commit, push and create/push the `project1-final` tag.

**Important:** No report or final screenshots are fabricated or bundled. The report must use the student's own measurements, screenshots and derivations.
