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

## Final submission checklist

- [ ] Inspect the app in a WebGPU-enabled browser, including both projections and the inspection frustum.
- [ ] Manually trace the desired painting contour, export JSON and replace the initial approximate file.
- [ ] Capture screenshots and measured frame times/GPU model for the report.
- [ ] Show one manually calculated Part B world matrix and Part C projection derivation.
- [ ] Include a 3–5-page `report.pdf` and AI-use disclosure as required by the handout.
- [ ] Commit, push and create/push the `project1-final` tag.

**Important:** No report or final screenshots are fabricated or bundled. The report must use the student's own measurements, screenshots and derivations.
