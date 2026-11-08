
/**
 * Entry point: wires GPU, painting, camera, scene and UI together and runs
 * the render loop. You will edit this file a little (camera controls, views);
 * most of your work goes into src/math/ and src/scene/.
 *
 *   p_clip = P · V · M · p_object
 */
import './ui/style.css';
import { initWebGPU, showFatal } from './render/gpu.js';
import { Renderer } from './render/renderer.js';
import { Painting } from './render/painting.js';
import {
  createCamera,
  viewProjection,
  createFrustumRenderer
} from './scene/camera.js';
import { createScene } from './scene/scene.js';
import { createPanel } from './ui/panel.js';
import { Stats } from './ui/stats.js';
import { attachPointer } from './ui/input.js';
import {
  PAINTINGS,
  DEFAULT_PAINTING,
  paintingURL
} from './config.js';
import * as mat4 from './math/mat4.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const gpu = await initWebGPU(canvas);
  const renderer = new Renderer(gpu);
  const painting = new Painting(gpu);

  const params = new URLSearchParams(location.search);
  let current = PAINTINGS.find((p) => p.id === params.get('painting'))
    ?? PAINTINGS.find((p) => p.id === DEFAULT_PAINTING);

  await painting.load(paintingURL(current));

  /* ---------------- UI ---------------- */
  const panelRoot = document.getElementById('panel');
  const panel = createPanel(panelRoot);

  const title = document.createElement('h1');
  title.textContent = 'CS405 · Project 1';
  panelRoot.appendChild(title);

  const stats = new Stats(panelRoot);

  const pf = panel.folder('Painting');

  pf.select(
    'painting',
    PAINTINGS.map((p) => ({
      value: p.id,
      label: `${p.artist} — ${p.title}`
    })),
    current.id,
    async (id) => {
      current = PAINTINGS.find((p) => p.id === id);
      await painting.load(paintingURL(current));
      history.replaceState(null, '', `?painting=${id}`);
    }
  );

  const camera = createCamera();

  // Fixed inspection camera — Part C
  const inspectionCamera = createCamera();
  inspectionCamera.eye = [12, 8, 15];
  inspectionCamera.target = [0, 0, 0];
  inspectionCamera.far = 100;

  const frustumRenderer = createFrustumRenderer(gpu);

  // Adapted from Week 4 demo w4lib.js
  const st = {
    yaw: 0,
    pitch: 0,
    dist: 2.8
  };

  const cf = panel.folder('Camera');
  let inspect = false;

  const viewSelect = cf.select('view', [
    { value: 'main', label: 'Main camera' },
    { value: 'inspection', label: 'Inspection camera' }
  ], 'main', (v) => {
    inspect = v === 'inspection';
  });

  const camStatus = cf.text('');

  const projectionSelect = cf.select(
    'projection',
    ['perspective', 'orthographic'],
    camera.projection,
    (v) => (camera.projection = v)
  );

  // Week 4 projection/depth demonstration: near, far, and vertical FOV.
  const depthSettings = { fovDegrees: camera.fovY * 180 / Math.PI };
  const fovSlider = cf.slider('fovY (degrees)', depthSettings, 'fovDegrees', 20, 100, 1,
    degrees => { camera.fovY = degrees * Math.PI / 180; });
  const nearSlider = cf.slider('near', camera, 'near', 0.05, 1, 0.05,
    value => { if (camera.far <= value) camera.far = value + 1; });
  const farSlider = cf.slider('far', camera, 'far', 3, 30, 0.5);
  cf.note('Week 4: near/far change the depth range; fovY changes perspective.');

  const camReadout = cf.text('');

  const scene = createScene({
    gpu,
    renderer,
    painting,
    panel,
    camera
  });

  const vf = panel.folder('View');

  vf.button('reset', () => {
    Object.assign(camera, createCamera());
    st.yaw = 0; st.pitch = 0; st.dist = 2.8;
    inspect = false;
    viewSelect.set('main');
    projectionSelect.set(camera.projection);
    depthSettings.fovDegrees = camera.fovY * 180 / Math.PI;
    fovSlider.update(); nearSlider.update(); farSlider.update();
    scene.reset();
  });

  vf.note(
    gpu.encodeSRGB
      ? 'sRGB: encoded in shader (fallback)'
      : 'sRGB: canvas -srgb view'
  );

  /* -------------- input --------------- */
  let activeVP = null;

  attachPointer(canvas, {
    down(e) {
      if (e.button === 0 && activeVP) {
        if (!inspect) scene.pointerDown(e.ndc, activeVP, e.shift, camera);
      }
    },

    up() {
      scene.pointerUp();
    },

    // Part C: Week 4 orbit/zoom controls. Part D: edit painting control points.
    drag(e) {
      if (e.button !== 0 || inspect) return;

      if (activeVP && scene.pointerDrag(e.ndc, activeVP, camera)) {
        return;
      }

      // Adapted from Week 4 demo w4lib.js
      st.yaw -= e.dx * 0.01;
      st.pitch = Math.max(
        -1.35,
        Math.min(1.35, st.pitch + e.dy * 0.008)
      );

      camera.eye = [
        camera.target[0] +
          st.dist * Math.cos(st.pitch) * Math.sin(st.yaw),

        camera.target[1] +
          st.dist * Math.sin(st.pitch),

        camera.target[2] +
          st.dist * Math.cos(st.pitch) * Math.cos(st.yaw),
      ];
    },

    wheel(e) {
      if (inspect) return; // inspection is a fixed reference view
      // Adapted from Week 4 demo w4lib.js
      st.dist = Math.max(
        2,
        Math.min(30, st.dist * (1 + e.delta * 0.001))
      );

      camera.eye = [
        camera.target[0] +
          st.dist * Math.cos(st.pitch) * Math.sin(st.yaw),

        camera.target[1] +
          st.dist * Math.sin(st.pitch),

        camera.target[2] +
          st.dist * Math.cos(st.pitch) * Math.cos(st.yaw),
      ];
    },
  });

  /* ------------ render loop ----------- */
  let last = performance.now();

  function frame(now) {
    stats.begin(now);

    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    scene.update(dt, now / 1000);

    const aspect = canvas.width / canvas.height;
    let vp;

    if (inspect) {
      vp = viewProjection(
        inspectionCamera,
        aspect,
        painting.aspect
      );
    } else {
      vp = viewProjection(
        camera,
        aspect,
        painting.aspect
      );
    }

    activeVP = vp.matrix;

    camStatus.set(
      vp.fallback
        ? `PLACEHOLDER view (no camera yet)\n${vp.missing}`
        : `camera: P · V (${inspect ? "inspection" : camera.projection})`
    );

    camStatus.el.classList.toggle('warn', vp.fallback);

    camReadout.set(
      `eye    ${camera.eye.map((x) => x.toFixed(2)).join(', ')}\n` +
      `target ${camera.target.map((x) => x.toFixed(2)).join(', ')}\n` +
      `fovY ${(camera.fovY * 180 / Math.PI).toFixed(1)}°  near ${camera.near}  far ${camera.far}`
    );

    const paintingMVP = vp.fallback
      ? vp.matrix
      : mat4.multiply(vp.matrix, painting.model);

    renderer.render(pass => {
      painting.draw(pass, paintingMVP, renderer);
      scene.draw(pass, vp.matrix);

      // Part C: Show the main camera's frustum from the inspection camera
      if (inspect) {
        frustumRenderer.draw(
          pass,
          camera,
          aspect,
          vp.matrix,
          renderer
        );
      }
    });

    stats.end(renderer.stats);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  showFatal(e.message ?? String(e));
});
