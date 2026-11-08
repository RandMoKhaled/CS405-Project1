
/**
 * Camera — Part C.
 *
 * The camera is plain data. viewProjection() turns it into P · V using YOUR
 * mat4.lookAt / mat4.perspective / mat4.orthographic / mat4.multiply.
 *
 * Until those exist it falls back to a fixed "fit the painting to the window"
 * matrix, so the starter shows your painting from the first `npm run dev`.
 * The panel tells you which of the two is active.
 */
import * as mat4 from '../math/mat4.js';
import * as vec3 from '../math/vec3.js';
import { NotImplemented } from '../math/todo.js';

// Adapted from the debug-axes rendering in scene.js
import { createShader, fragmentConstants } from '../render/shader.js';
import { DEPTH_FORMAT } from '../render/renderer.js';

export function createCamera() {
  return {
    eye: [0, 0, 2.8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fovY: Math.PI / 4, // radians
    near: 0.1,
    far: 8,
    projection: 'perspective', // or 'orthographic'
    orthoHeight: 2.2, // world units visible vertically in orthographic mode
  };
}

/**
 * @param {object} cam     from createCamera()
 * @param {number} aspect  canvas width / height
 * @param {number} paintingAspect  image width / height (only used by the fallback)
 * @returns {{ matrix: Float32Array, fallback: boolean, missing?: string }}
 */
export function viewProjection(cam, aspect, paintingAspect = 1) {
  try {
    const view = mat4.lookAt(cam.eye, cam.target, cam.up);
    let proj;
    if (cam.projection === 'orthographic') {
      const h = cam.orthoHeight / 2, w = h * aspect;
      proj = mat4.orthographic(-w, w, -h, h, cam.near, cam.far);
    } else {
      proj = mat4.perspective(cam.fovY, aspect, cam.near, cam.far);
    }
    return { matrix: mat4.multiply(proj, view), fallback: false };
  } catch (e) {
    if (!(e instanceof NotImplemented)) throw e;
    return { matrix: fitMatrix(aspect, paintingAspect), fallback: true, missing: e.message };
  }
}

// Part C: Frustum corners — adapted from Week 4 w4b.js
export function frustumCorners(camera, aspect) {
  const eye = camera.eye;
  const target = camera.target;
  const up = camera.up;

  // Week 4 camera basis, using the tested Week 1 vector helpers.
  const { sub, dot, cross, normalize: norm } = vec3;

  // Same camera basis calculation as Week 4 w4b.js
  const w = norm(sub(eye, target));

  let u = cross(up, w);
  if (dot(u, u) < 0.000001) {
    if (Math.abs(w[1]) < 0.9) {
      u = cross([0, 1, 0], w);
    } else {
      u = cross([1, 0, 0], w);
    }
  }
  u = norm(u);

  const v = cross(w, u);

  // Calculate one corner at distance d
  const corner = (d, sx, sy) => {
    let hh;

    if (camera.projection === 'perspective') {
      hh = Math.tan(camera.fovY / 2) * d;
    } else {
      hh = camera.orthoHeight / 2;
    }

    const hw = hh * aspect;

    return [
      eye[0] - w[0] * d + u[0] * sx * hw + v[0] * sy * hh,
      eye[1] - w[1] * d + u[1] * sx * hw + v[1] * sy * hh,
      eye[2] - w[2] * d + u[2] * sx * hw + v[2] * sy * hh
    ];
  };

  // Four corners of the near plane
  const nr = [
    corner(camera.near, -1, -1),
    corner(camera.near,  1, -1),
    corner(camera.near,  1,  1),
    corner(camera.near, -1,  1)
  ];

  // Four corners of the far plane
  const fr = [
    corner(camera.far, -1, -1),
    corner(camera.far,  1, -1),
    corner(camera.far,  1,  1),
    corner(camera.far, -1,  1)
  ];

  return { nr, fr };
}

// Part C: Frustum rendering
// WebGPU structure adapted from the debug-axes code in scene.js
export function createFrustumRenderer(gpu) {
  const { device } = gpu;

  // 12 edges, 2 vertices per edge, 6 floats per vertex
  // (x, y, z, r, g, b)
  const frustumData = new Float32Array(12 * 2 * 6);

  const frustumBuffer = device.createBuffer({
    label: 'camera frustum vertices',
    size: frustumData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });

  // Part C: Connect the frustum corners
  function updateFrustum(camera, aspect) {
    const { nr, fr } = frustumCorners(camera, aspect);
    let index = 0;

    function addLine(a, b) {
      // First vertex: position + orange colour
      frustumData.set([...a, 1, 0.5, 0], index);
      index += 6;

      // Second vertex: position + orange colour
      frustumData.set([...b, 1, 0.5, 0], index);
      index += 6;
    }

    for (let k = 0; k < 4; k++) {
      // Four edges of the near plane
      addLine(nr[k], nr[(k + 1) % 4]);

      // Four edges of the far plane
      addLine(fr[k], fr[(k + 1) % 4]);

      // Four lines connecting near and far planes
      addLine(nr[k], fr[k]);
    }

    device.queue.writeBuffer(frustumBuffer, 0, frustumData);
  }

  // Same shader structure as the debug axes in scene.js.
  // No Node buffer is needed: corners are already in world coordinates.
  const frustumShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
    };

    @group(0) @binding(0) var<uniform> cam: Camera;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) colour: vec3f,
    };

    @vertex
    fn vs(
      @location(0) p: vec3f,
      @location(1) colour: vec3f
    ) -> VSOut {
      var o: VSOut;
      o.pos = cam.viewProj * vec4f(p, 1.0);
      o.colour = colour;
      return o;
    }

    @fragment
    fn fs(in: VSOut) -> @location(0) vec4f {
      return toOutput(vec4f(in.colour, 1.0));
    }
  `, 'camera frustum');

  // Separate uniform buffer for the inspection camera
  const frustumCamBuf = device.createBuffer({
    label: 'frustum camera uniforms',
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  // Adapted from axesPipeline in scene.js
  const frustumPipeline = device.createRenderPipeline({
    layout: 'auto',

    vertex: {
      module: frustumShader,
      entryPoint: 'vs',
      buffers: [{
        arrayStride: 6 * 4,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 3 * 4, format: 'float32x3' },
        ],
      }],
    },

    fragment: {
      module: frustumShader,
      entryPoint: 'fs',
      targets: [{ format: gpu.viewFormat }],
      constants: fragmentConstants(gpu),
    },

    primitive: {
      topology: 'line-list',
    },

    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
  });

  // Adapted from axesBindGroup in scene.js
  const frustumBindGroup = device.createBindGroup({
    layout: frustumPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: frustumCamBuf } },
    ],
  });

  return {
    draw(pass, camera, aspect, inspectionViewProj, renderer) {
      // Calculate the main camera's frustum
      updateFrustum(camera, aspect);

      // Transform it using the inspection camera
      device.queue.writeBuffer(frustumCamBuf, 0, inspectionViewProj);

      pass.setPipeline(frustumPipeline);
      pass.setBindGroup(0, frustumBindGroup);
      pass.setVertexBuffer(0, frustumBuffer);

      // 12 lines, 24 vertices
      pass.draw(24);
      renderer.countDraw(24);
    }
  };
}

/**
 * Placeholder used until Part C works: scales the painting quad (height 2,
 * width 2·paintingAspect, centred at the origin in the z = 0 plane) to fit
 * the canvas, and maps world z to depth so that +z is in front.
 * There is no camera here — do not build on this.
 */
function fitMatrix(aspect, paintingAspect) {
  const s = 0.92 * Math.min(1, aspect / paintingAspect);
  return new Float32Array([
    s / aspect, 0, 0, 0,
    0, s, 0, 0,
    0, 0, -0.05, 0,
    0, 0, 0.5, 1,
  ]);
}
