
/**
 * YOUR SCENE — Parts A, B and D.
 *
 * main.js calls:
 *   scene.update(dt, time)
 *   scene.draw(pass, viewProj)
 *   scene.reset()
 *
 * Part A: Three 3D objects and transformations.
 * Part B: Hierarchical scene graph.
 * Part D: Bezier curves, C1 continuity, Catmull-Rom,
 *         de Casteljau, mouse editing, animation and JSON export.
 *
 * WebGPU note:
 * Upload buffer contents BEFORE issuing draw commands.
 *
 * Call renderer.countDraw(vertexCount) after each draw.
 */

import { cube } from './geometry.js';
import {
  createShader,
  fragmentConstants
} from '../render/shader.js';
import { DEPTH_FORMAT } from '../render/renderer.js';
import * as mat4 from '../math/mat4.js';
import { SceneNode } from './node.js';
import { cubicBezier, cubicBezierTangent, deCasteljau, c1NextControl, catmullRom } from '../math/curves.js';
import {
  curveToJSON,
  downloadJSON
} from './curveExport.js';

const cubeData = cube();

// The curve functions live in math/curves.js, where the course tests them.
// This scene uses those same tested implementations (Week 6 / Part D).

// ============================================================
// CREATE SCENE
// ============================================================

export function createScene({
  gpu,
  renderer,
  painting,
  panel,
  camera
}) {
  const { device } = gpu;

  const SAMPLES = 100;
  const SEGMENTS = 3;
  const CURVE_Z = 0.055;

  // ==========================================================
  // GPU HELPERS
  // ==========================================================

  function vertexBuffer(label, data) {
    return device.createBuffer({
      label,
      size: Math.max(4, Math.ceil(data.byteLength / 4) * 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
  }

  function upload(buffer, data) {
    device.queue.writeBuffer(buffer, 0, data);
  }

  // ==========================================================
  // PART D — BEZIER CONTROL POINTS
  // ==========================================================

  // Approximate upper rind of the melon in the default Kavunlu painting.
  // Fine-tune with Part D edit mode; export the adjusted points to JSON.
  const initialAnchors = [
    [-0.56, 0.48, CURVE_Z],
    [-0.08, 0.76, CURVE_Z],
    [ 0.52, 0.69, CURVE_Z],
    [ 1.05, 0.27, CURVE_Z]
  ];

  const initialFirstHandle = [
    -0.41, 0.69, CURVE_Z
  ];

  const initialEndHandles = [
    [-0.24, 0.78, CURVE_Z],
    [ 0.36, 0.84, CURVE_Z],
    [ 0.96, 0.51, CURVE_Z]
  ];

  const anchors = initialAnchors.map(p => [...p]);
  const firstHandle = [...initialFirstHandle];
  const endHandles = initialEndHandles.map(p => [...p]);

  function getSegments() {
    const result = [];

    for (let i = 0; i < SEGMENTS; i++) {
      const p0 = anchors[i];

      const p1 = i === 0
        ? firstHandle
        : c1NextControl(endHandles[i - 1], anchors[i]);

      const p2 = endHandles[i];
      const p3 = anchors[i + 1];

      result.push([
        [...p0],
        [...p1],
        [...p2],
        [...p3]
      ]);
    }

    return result;
  }

  function editableHandles() {
    const result = [];

    anchors.forEach((p, i) => {
      result.push({
        p,
        type: 'anchor',
        index: i
      });
    });

    result.push({
      p: firstHandle,
      type: 'first',
      index: 0
    });

    endHandles.forEach((p, i) => {
      result.push({
        p,
        type: 'end',
        index: i
      });
    });

    return result;
  }

  // ==========================================================
  // PART D — VERTEX DATA
  // ==========================================================

  const curveData = new Float32Array(
    SEGMENTS * (SAMPLES + 1) * 3
  );

  const catData = new Float32Array(
    SEGMENTS * (SAMPLES + 1) * 3
  );

  // 10 visible handles, 6 vertices per square, 3 floats each.
  const controlData = new Float32Array(10 * 6 * 3);

  // de Casteljau: 6 line segments = 12 vertices,
  // each vertex has position + colour = 6 floats.
  const constructionData = new Float32Array(12 * 6);

  const movingData = new Float32Array(6 * 6);
  const travelerData = new Float32Array(9);

  const curveBuffer = vertexBuffer('Bezier curve', curveData);
  const catBuffer = vertexBuffer('Catmull Rom curve', catData);
  const controlBuffer = vertexBuffer('Control points', controlData);
  const constructionBuffer = vertexBuffer(
    'de Casteljau construction',
    constructionData
  );
  const movingBuffer = vertexBuffer(
    'de Casteljau point',
    movingData
  );
  const travelerBuffer = vertexBuffer(
    'Animated triangle',
    travelerData
  );

  let controlVertexCount = 0;
  let constructionVertexCount = 0;
  let curveDirty = true;
  let travelU = 0;

  function addSquare(data, offset, p, size) {
    const [x, y, z] = p;

    data.set([
      x-size, y-size, z,
      x+size, y-size, z,
      x+size, y+size, z,

      x-size, y-size, z,
      x+size, y+size, z,
      x-size, y+size, z
    ], offset);

    return offset + 18;
  }

  function updateBezierBuffers() {
    const segments = getSegments();
    let offset = 0;

    for (const segment of segments) {
      for (let j = 0; j <= SAMPLES; j++) {
        const t = j / SAMPLES;
        const p = cubicBezier(...segment, t);

        curveData.set(p, offset);
        offset += 3;
      }
    }

    upload(curveBuffer, curveData);

    offset = 0;

    for (const h of editableHandles()) {
      offset = addSquare(
        controlData,
        offset,
        h.p,
        0.025
      );
    }

    // Show the two reflected C1 handles.
    for (let i = 1; i < SEGMENTS; i++) {
      offset = addSquare(
        controlData,
        offset,
        segments[i][1],
        0.018
      );
    }

    controlVertexCount = offset / 3;
    upload(controlBuffer, controlData);

    updateCatmullBuffer();
    curveDirty = false;
  }

  function updateCatmullBuffer() {
    let offset = 0;

    for (let i = 0; i < SEGMENTS; i++) {
      const p0 = anchors[Math.max(0, i - 1)];
      const p1 = anchors[i];
      const p2 = anchors[i + 1];
      const p3 = anchors[Math.min(3, i + 2)];

      for (let j = 0; j <= SAMPLES; j++) {
        const t = j / SAMPLES;
        const p = catmullRom(p0, p1, p2, p3, t);

        catData.set(p, offset);
        offset += 3;
      }
    }

    upload(catBuffer, catData);
  }

  // ==========================================================
  // STATE
  // ==========================================================

  const state = {
    debugAxes: false,

    tx: 0,
    ty: 0,
    tz: 0.6,

    rx: Math.PI / 6,
    ry: Math.PI / 4,
    rz: 0,

    sx: 0.3,
    sy: 0.3,
    sz: 0.3,

    trs: true,

    t: 0.5,
    showCatmull: false,
    showConstruction: true,
    animateCurve: true,
    editPoints: false
  };

  // ==========================================================
  // PART D — DE CASTELJAU
  // ==========================================================

  function updateConstruction() {
    const levels = deCasteljau(
      getSegments()[0],
      state.t
    );

    const colours = [
      [0.95, 0.95, 0.95],
      [0.20, 0.75, 1.00],
      [1.00, 0.45, 0.20]
    ];

    let offset = 0;

    constructionData.fill(0);

    for (let level = 0; level < 3; level++) {
      const points = levels[level];
      const colour = colours[level];

      for (let i = 0; i < points.length - 1; i++) {
        constructionData.set(
          [...points[i], ...colour],
          offset
        );
        offset += 6;

        constructionData.set(
          [...points[i + 1], ...colour],
          offset
        );
        offset += 6;
      }
    }

    constructionVertexCount = offset / 6;
    upload(constructionBuffer, constructionData);

    const p = levels[3][0];
    const [x, y, z] = p;

    const s = 0.035;
    const pink = [1.0, 0.25, 0.65];

    movingData.set([
      x-s, y-s, z, ...pink,
      x+s, y-s, z, ...pink,
      x+s, y+s, z, ...pink,

      x-s, y-s, z, ...pink,
      x+s, y+s, z, ...pink,
      x-s, y+s, z, ...pink
    ]);

    upload(movingBuffer, movingData);
  }

  // ==========================================================
  // PART D — ANIMATED TANGENT-ALIGNED TRIANGLE
  // ==========================================================

  function updateTraveler() {
    const segments = getSegments();

    const scaled = Math.min(
      Math.max(travelU * SEGMENTS, 0),
      SEGMENTS - 0.000001
    );

    const segmentIndex = Math.floor(scaled);
    const t = scaled - segmentIndex;

    const segment = segments[segmentIndex];

    if (!segment) return;

    const p = cubicBezier(...segment, t);
    const tangent = cubicBezierTangent(...segment, t);

    let dx = tangent[0];
    let dy = tangent[1];

    let magnitude = Math.hypot(dx, dy);

    if (magnitude < 0.000001) {
      const t0 = Math.max(0, t - 0.001);
      const t1 = Math.min(1, t + 0.001);

      const a = cubicBezier(...segment, t0);
      const b = cubicBezier(...segment, t1);

      dx = b[0] - a[0];
      dy = b[1] - a[1];
      magnitude = Math.hypot(dx, dy);
    }

    if (magnitude < 0.000001) {
      dx = 1;
      dy = 0;
      magnitude = 1;
    }

    const ux = dx / magnitude;
    const uy = dy / magnitude;

    const nx = -uy;
    const ny = ux;

    const size = 0.075;
    const width = 0.035;
    const z = p[2] + 0.01;

    travelerData.set([
      p[0] + ux * size,
      p[1] + uy * size,
      z,

      p[0] - ux * size * 0.5 + nx * width,
      p[1] - uy * size * 0.5 + ny * width,
      z,

      p[0] - ux * size * 0.5 - nx * width,
      p[1] - uy * size * 0.5 - ny * width,
      z
    ]);

    upload(travelerBuffer, travelerData);
  }

  // ==========================================================
  // PART A — CUBE BUFFER AND CAMERA UNIFORMS
  // ==========================================================

  const cubeBuffer = vertexBuffer('Cube', cubeData);
  upload(cubeBuffer, cubeData);

  const NODE_FLOATS = 20;
  const NODE_COUNT = 5;

  const nodeData = new Float32Array(
    NODE_COUNT * NODE_FLOATS
  );

  const nodeBuf = device.createBuffer({
    label: 'Node storage',
    size: nodeData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  });

  const camBuf = device.createBuffer({
    label: 'Camera uniforms',
    size: 80,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });

  const cubeShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
      eye: vec4f,
    };

    struct Node {
      model: mat4x4f,
      colour: vec4f,
    };

    @group(0) @binding(0)
    var<uniform> cam: Camera;

    @group(0) @binding(1)
    var<storage, read> nodes: array<Node>;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) normal: vec3f,
      @location(1) colour: vec4f,
    };

    @vertex
    fn vs(
      @location(0) position: vec3f,
      @location(1) normal: vec3f,
      @builtin(instance_index) i: u32
    ) -> VSOut {
      let node = nodes[i];
      let world = node.model * vec4f(position, 1.0);

      var out: VSOut;
      out.pos = cam.viewProj * world;
      out.normal = normalize(
        (node.model * vec4f(normal, 0.0)).xyz
      );
      out.colour = node.colour;

      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      let light = normalize(vec3f(0.45, 0.85, 0.35));
      let diffuse = max(
        dot(normalize(input.normal), light),
        0.0
      );

      let brightness = 0.3 + 0.7 * diffuse;

      return toOutput(vec4f(
        input.colour.rgb * brightness,
        1.0
      ));
    }
  `, 'Cube shader');

  const cubePipeline = device.createRenderPipeline({
    layout: 'auto',

    vertex: {
      module: cubeShader,
      entryPoint: 'vs',
      buffers: [{
        arrayStride: 24,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x3'
          },
          {
            shaderLocation: 1,
            offset: 12,
            format: 'float32x3'
          }
        ]
      }]
    },

    fragment: {
      module: cubeShader,
      entryPoint: 'fs',
      targets: [{
        format: gpu.viewFormat
      }],
      constants: fragmentConstants(gpu)
    },

    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw',
      cullMode: 'none'
    },

    depthStencil: {
      format: DEPTH_FORMAT,
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  });

  const cubeBindGroup = device.createBindGroup({
    layout: cubePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: camBuf }
      },
      {
        binding: 1,
        resource: { buffer: nodeBuf }
      }
    ]
  });

  // ==========================================================
  // PART B — SCENE GRAPH
  // ==========================================================

  const root = new SceneNode('root');
  const blueNode = new SceneNode('blue');
  const pinkNode = new SceneNode('pink');
  const greenGroup = new SceneNode('greenGroup');
  const greenNode = new SceneNode('green');

  root.addChild(blueNode);
  blueNode.addChild(pinkNode);
  blueNode.addChild(greenGroup);
  greenGroup.addChild(greenNode);

  blueNode.data.colour = [0.3, 0.7, 0.9, 1];
  pinkNode.data.colour = [0.8, 0.3, 0.5, 1];
  greenNode.data.colour = [0.4, 0.8, 0.5, 1];

  pinkNode.local = mat4.translate(-2.5, 0, 0);
  greenNode.local = mat4.translate(2.5, 0, 0);

  let animationAngle = 0;

  function updateNodeBuffer() {
    let slot = 0;

    function push(world, colour) {
      nodeData.set(world, slot * NODE_FLOATS);
      nodeData.set(colour, slot * NODE_FLOATS + 16);
      slot++;
    }

    push(pinkNode.world, pinkNode.data.colour);
    push(blueNode.world, blueNode.data.colour);
    push(greenNode.world, greenNode.data.colour);
    push(root.world, [1, 1, 1, 1]);
    push(greenGroup.world, [1, 1, 1, 1]);

    upload(nodeBuf, nodeData);
  }

  // ==========================================================
  // SHADER AND PIPELINE HELPERS
  // ==========================================================

  const positionLayout = [{
    arrayStride: 12,
    attributes: [{
      shaderLocation: 0,
      offset: 0,
      format: 'float32x3'
    }]
  }];

  const colouredLayout = [{
    arrayStride: 24,
    attributes: [
      {
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3'
      },
      {
        shaderLocation: 1,
        offset: 12,
        format: 'float32x3'
      }
    ]
  }];

  function makePipeline(
    shader,
    topology,
    buffers,
    depthWrite = false
  ) {
    return device.createRenderPipeline({
      layout: 'auto',

      vertex: {
        module: shader,
        entryPoint: 'vs',
        buffers
      },

      fragment: {
        module: shader,
        entryPoint: 'fs',
        targets: [{
          format: gpu.viewFormat
        }],
        constants: fragmentConstants(gpu)
      },

      primitive: {
        topology
      },

      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: depthWrite,
        depthCompare: 'less-equal'
      }
    });
  }

  function cameraBindGroup(pipeline) {
    return device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: camBuf }
      }]
    });
  }

  // ==========================================================
  // BEZIER PIPELINES
  // ==========================================================

  const curveShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
      eye: vec4f,
    };

    @group(0) @binding(0)
    var<uniform> cam: Camera;

    @vertex
    fn vs(
      @location(0) position: vec3f
    ) -> @builtin(position) vec4f {
      return cam.viewProj * vec4f(position, 1.0);
    }

    @fragment
    fn fs() -> @location(0) vec4f {
      return toOutput(vec4f(1.0, 0.85, 0.1, 1.0));
    }
  `, 'Bezier shader');

  const curvePipeline = makePipeline(
    curveShader,
    'line-strip',
    positionLayout
  );

  const curveBindGroup = cameraBindGroup(curvePipeline);

  const pointPipeline = makePipeline(
    curveShader,
    'triangle-list',
    positionLayout
  );

  const pointBindGroup = cameraBindGroup(pointPipeline);

  // ==========================================================
  // CATMULL-ROM PIPELINE
  // ==========================================================

  const catShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
      eye: vec4f,
    };

    @group(0) @binding(0)
    var<uniform> cam: Camera;

    @vertex
    fn vs(
      @location(0) position: vec3f
    ) -> @builtin(position) vec4f {
      return cam.viewProj * vec4f(position, 1.0);
    }

    @fragment
    fn fs() -> @location(0) vec4f {
      return toOutput(vec4f(0.15, 0.85, 1.0, 1.0));
    }
  `, 'Catmull-Rom shader');

  const catPipeline = makePipeline(
    catShader,
    'line-strip',
    positionLayout
  );

  const catBindGroup = cameraBindGroup(catPipeline);

  // ==========================================================
  // CONSTRUCTION PIPELINES
  // ==========================================================

  const constructionShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
      eye: vec4f,
    };

    @group(0) @binding(0)
    var<uniform> cam: Camera;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) colour: vec3f,
    };

    @vertex
    fn vs(
      @location(0) position: vec3f,
      @location(1) colour: vec3f
    ) -> VSOut {
      var out: VSOut;
      out.pos = cam.viewProj * vec4f(position, 1.0);
      out.colour = colour;
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return toOutput(vec4f(input.colour, 1.0));
    }
  `, 'Construction shader');

  const constructionPipeline = makePipeline(
    constructionShader,
    'line-list',
    colouredLayout
  );

  const constructionBindGroup =
    cameraBindGroup(constructionPipeline);

  const movingPipeline = makePipeline(
    constructionShader,
    'triangle-list',
    colouredLayout
  );

  const movingBindGroup = cameraBindGroup(movingPipeline);

  // ==========================================================
  // DEBUG AXES
  // ==========================================================

  const axesData = new Float32Array([
    0,0,0, 1,0,0,
    1.2,0,0, 1,0,0,

    0,0,0, 0,1,0,
    0,1.2,0, 0,1,0,

    0,0,0, 0,0,1,
    0,0,1.2, 0,0,1
  ]);

  const axesBuffer = vertexBuffer('Axes', axesData);
  upload(axesBuffer, axesData);

  const axesShader = createShader(device, /* wgsl */ `
    struct Camera {
      viewProj: mat4x4f,
      eye: vec4f,
    };

    struct Node {
      model: mat4x4f,
      colour: vec4f,
    };

    @group(0) @binding(0)
    var<uniform> cam: Camera;

    @group(0) @binding(1)
    var<storage, read> nodes: array<Node>;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) colour: vec3f,
    };

    @vertex
    fn vs(
      @location(0) position: vec3f,
      @location(1) colour: vec3f,
      @builtin(instance_index) i: u32
    ) -> VSOut {
      var out: VSOut;

      out.pos =
        cam.viewProj *
        nodes[i].model *
        vec4f(position, 1.0);

      out.colour = colour;
      return out;
    }

    @fragment
    fn fs(input: VSOut) -> @location(0) vec4f {
      return toOutput(vec4f(input.colour, 1.0));
    }
  `, 'Axes shader');

  const axesPipeline = makePipeline(
    axesShader,
    'line-list',
    colouredLayout
  );

  const axesBindGroup = device.createBindGroup({
    layout: axesPipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: { buffer: camBuf }
      },
      {
        binding: 1,
        resource: { buffer: nodeBuf }
      }
    ]
  });

  // ==========================================================
  // UI CONTROLS
  // ==========================================================

  const sceneFolder = panel.folder('Scene');

  sceneFolder.toggle(
    'debug axes',
    state,
    'debugAxes'
  );

  const partA = panel.folder('Part A — Transformations');

  const txSlider = partA.slider(
    'Translate X', state, 'tx', -1.5, 1.5, 0.01
  );

  const tySlider = partA.slider(
    'Translate Y', state, 'ty', -1.5, 1.5, 0.01
  );

  const tzSlider = partA.slider(
    'Translate Z', state, 'tz', 0.1, 1.5, 0.01
  );

  const rxSlider = partA.slider(
    'Rotate X', state, 'rx', -Math.PI, Math.PI, 0.01
  );

  const rySlider = partA.slider(
    'Rotate Y', state, 'ry', -Math.PI, Math.PI, 0.01
  );

  const rzSlider = partA.slider(
    'Rotate Z', state, 'rz', -Math.PI, Math.PI, 0.01
  );

  const sxSlider = partA.slider(
    'Scale X', state, 'sx', 0.1, 1.5, 0.01
  );

  const sySlider = partA.slider(
    'Scale Y', state, 'sy', 0.1, 1.5, 0.01
  );

  const szSlider = partA.slider(
    'Scale Z', state, 'sz', 0.1, 1.5, 0.01
  );

  const trsToggle = partA.toggle(
    'T·R·S order',
    state,
    'trs'
  );

  partA.note('T · R · S matrix');
  const trsReadout = partA.text();

  partA.note('S · R · T matrix');
  const srtReadout = partA.text();

  const partD = panel.folder('Part D — Curves');

  const tSlider = partD.slider(
    't',
    state,
    't',
    0,
    1,
    0.01
  );

  const catToggle = partD.toggle(
    'show Catmull-Rom',
    state,
    'showCatmull'
  );

  const constructionToggle = partD.toggle(
    'show construction',
    state,
    'showConstruction'
  );

  const animationToggle = partD.toggle(
    'animate along curve',
    state,
    'animateCurve'
  );

  const editToggle = partD.toggle(
    'edit control points (left drag)',
    state,
    'editPoints'
  );

  partD.note(
    'Enable editing to drag control points. ' +
    'Shift+click moves the nearest control point. ' +
    'Disable editing to orbit the camera.'
  );

  partD.button('export curve JSON', () => {
    const id =
      new URLSearchParams(location.search)
        .get('painting') ?? 'kavunlu';

    const json = curveToJSON({
      painting: id,
      kind: 'bezier-c1',
      aspect: painting.aspect,
      segments: getSegments()
    });

    downloadJSON(json, `${id}-curve.json`);
  });

  // ==========================================================
  // MATRIX DISPLAY
  // ==========================================================

  function formatMatrix(m) {
    let result = '';

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        result += Number(
          m[col * 4 + row]
        ).toFixed(2).padStart(7);
      }

      result += '\n';
    }

    return result;
  }

  // ==========================================================
  // MOUSE EDITING
  // ==========================================================

  function screenToPainting(ndc, pickingCamera = camera) {
    const view = mat4.lookAt(
      pickingCamera.eye,
      pickingCamera.target,
      pickingCamera.up
    );

    const right = [
      view[0],
      view[4],
      view[8]
    ];

    const up = [
      view[1],
      view[5],
      view[9]
    ];

    const forward = [
      -view[2],
      -view[6],
      -view[10]
    ];

    const canvas = document.getElementById('gfx');
    const aspect = canvas.width / canvas.height;

    let origin;
    let direction;

    if (pickingCamera.projection === 'orthographic') {
      const h = (pickingCamera.orthoHeight ?? 2) / 2;

      origin = pickingCamera.eye.map((v, i) =>
        v +
        right[i] * ndc[0] * h * aspect +
        up[i] * ndc[1] * h
      );

      direction = forward;
    } else {
      const scale = Math.tan(pickingCamera.fovY / 2);

      origin = pickingCamera.eye;

      direction = forward.map((v, i) =>
        v +
        right[i] * ndc[0] * scale * aspect +
        up[i] * ndc[1] * scale
      );
    }

    if (Math.abs(direction[2]) < 0.000001) {
      return null;
    }

    const distance =
      (CURVE_Z - origin[2]) / direction[2];

    if (distance < 0) return null;

    return [
      origin[0] + distance * direction[0],
      origin[1] + distance * direction[1],
      CURVE_Z
    ];
  }

  let activeHandle = null;

  function editDown(ndc, shift = false, pickingCamera = camera) {
    if (!state.editPoints) return false;

    const p = screenToPainting(ndc, pickingCamera);

    if (!p) return true;

    let nearest = null;
    let nearestDistance = Infinity;

    for (const h of editableHandles()) {
      const distance = Math.hypot(
        h.p[0] - p[0],
        h.p[1] - p[1]
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = h;
      }
    }

    if (nearest && (nearestDistance < 0.13 || shift)) {
      activeHandle = nearest;

      if (shift) {
        editDrag(ndc, pickingCamera);
      }
    }

    return true;
  }

  function editDrag(ndc, pickingCamera = camera) {
    if (!state.editPoints) return false;
    if (!activeHandle) return true;

    const p = screenToPainting(ndc, pickingCamera);

    if (!p) return true;

    const aspect = painting.aspect;

    p[0] = Math.max(-aspect, Math.min(aspect, p[0]));
    p[1] = Math.max(-1, Math.min(1, p[1]));

    const target = activeHandle.p;

    const dx = p[0] - target[0];
    const dy = p[1] - target[1];

    target[0] = p[0];
    target[1] = p[1];

    if (activeHandle.type === 'anchor') {
      const i = activeHandle.index;

      // Translate adjacent handles with the anchor.
      if (i === 0) {
        firstHandle[0] += dx;
        firstHandle[1] += dy;
      }

      if (i > 0) {
        endHandles[i - 1][0] += dx;
        endHandles[i - 1][1] += dy;
      }

      if (i > 0 && i < SEGMENTS) {
        endHandles[i][0] += dx;
        endHandles[i][1] += dy;
      }
    }

    curveDirty = true;

    return true;
  }

  // ==========================================================
  // INITIALIZE CURVE DATA
  // ==========================================================

  updateBezierBuffers();
  updateConstruction();
  updateTraveler();

  // ==========================================================
  // PUBLIC SCENE API
  // ==========================================================

  return {
    state,

    pointerDown(ndc, vp, shift, pickingCamera = camera) {
      return editDown(ndc, shift, pickingCamera);
    },

    pointerDrag(ndc, vp, pickingCamera = camera) {
      return editDrag(ndc, pickingCamera);
    },

    pointerUp() {
      activeHandle = null;
    },

    update(dt, time) {
      // ------------------------------------------------------
      // PART A — TRANSFORMATIONS
      // ------------------------------------------------------

      const T = mat4.translate(
        state.tx,
        state.ty,
        state.tz
      );

      const Rx = mat4.rotateX(state.rx);
      const Ry = mat4.rotateY(state.ry);
      const Rz = mat4.rotateZ(state.rz);

      const R = mat4.multiply(
        mat4.multiply(Ry, Rx),
        Rz
      );

      const S = mat4.scale(
        state.sx,
        state.sy,
        state.sz
      );

      const trsMatrix = mat4.multiply(
        mat4.multiply(T, R),
        S
      );

      const srtMatrix = mat4.multiply(
        mat4.multiply(S, R),
        T
      );

      blueNode.local = state.trs
        ? trsMatrix
        : srtMatrix;

      // ------------------------------------------------------
      // PART B — SCENE GRAPH ANIMATION
      // ------------------------------------------------------

      animationAngle += dt * 0.5;

      greenGroup.local = mat4.rotateY(animationAngle);

      root.updateWorld();

      // ------------------------------------------------------
      // PART D — CURVE UPDATES
      // ------------------------------------------------------

      if (state.animateCurve) {
        travelU = (travelU + dt * 0.12) % 1;
      }

      if (curveDirty) {
        updateBezierBuffers();
      }

      // All GPU uploads occur before rendering.
      updateConstruction();
      updateTraveler();
      updateNodeBuffer();

      trsReadout.set(formatMatrix(trsMatrix));
      srtReadout.set(formatMatrix(srtMatrix));
    },

    draw(pass, viewProj) {
      // ------------------------------------------------------
      // CAMERA UNIFORM
      // ------------------------------------------------------

      const cam = new Float32Array(20);

      cam.set(viewProj, 0);

      cam.set([
        camera.eye[0],
        camera.eye[1],
        camera.eye[2],
        1
      ], 16);

      upload(camBuf, cam);

      // ------------------------------------------------------
      // PART A / B — DRAW CUBES
      // ------------------------------------------------------

      pass.setPipeline(cubePipeline);
      pass.setBindGroup(0, cubeBindGroup);
      pass.setVertexBuffer(0, cubeBuffer);

      const cubeVertexCount = cubeData.length / 6;

      pass.draw(cubeVertexCount, 3);

      renderer.countDraw(cubeVertexCount * 3);

      // ------------------------------------------------------
      // DEBUG AXES
      // ------------------------------------------------------

      if (state.debugAxes) {
        pass.setPipeline(axesPipeline);
        pass.setBindGroup(0, axesBindGroup);
        pass.setVertexBuffer(0, axesBuffer);

        // Draw the local coordinate axes of all 5 scene graph nodes.
        // Each instance uses its corresponding world matrix
        // from the node storage buffer.
        pass.draw(6, NODE_COUNT);

        renderer.countDraw(6 * NODE_COUNT);
      }

      // ------------------------------------------------------
      // PART D — BEZIER CURVES
      // ------------------------------------------------------

      pass.setPipeline(curvePipeline);
      pass.setBindGroup(0, curveBindGroup);
      pass.setVertexBuffer(0, curveBuffer);

      for (let i = 0; i < SEGMENTS; i++) {
        pass.draw(
          SAMPLES + 1,
          1,
          i * (SAMPLES + 1)
        );

        renderer.countDraw(SAMPLES + 1);
      }

      // ------------------------------------------------------
      // CATMULL-ROM
      // ------------------------------------------------------

      if (state.showCatmull) {
        pass.setPipeline(catPipeline);
        pass.setBindGroup(0, catBindGroup);
        pass.setVertexBuffer(0, catBuffer);

        for (let i = 0; i < SEGMENTS; i++) {
          pass.draw(
            SAMPLES + 1,
            1,
            i * (SAMPLES + 1)
          );

          renderer.countDraw(SAMPLES + 1);
        }
      }

      // ------------------------------------------------------
      // CONTROL POINTS
      // ------------------------------------------------------

      pass.setPipeline(pointPipeline);
      pass.setBindGroup(0, pointBindGroup);
      pass.setVertexBuffer(0, controlBuffer);

      pass.draw(controlVertexCount);

      renderer.countDraw(controlVertexCount);

      // ------------------------------------------------------
      // DE CASTELJAU
      // ------------------------------------------------------

      if (state.showConstruction) {
        pass.setPipeline(constructionPipeline);
        pass.setBindGroup(0, constructionBindGroup);
        pass.setVertexBuffer(0, constructionBuffer);

        pass.draw(constructionVertexCount);

        renderer.countDraw(constructionVertexCount);

        pass.setPipeline(movingPipeline);
        pass.setBindGroup(0, movingBindGroup);
        pass.setVertexBuffer(0, movingBuffer);

        pass.draw(6);

        renderer.countDraw(6);
      }

      // ------------------------------------------------------
      // ANIMATED TRIANGLE
      // ------------------------------------------------------

      pass.setPipeline(pointPipeline);
      pass.setBindGroup(0, pointBindGroup);
      pass.setVertexBuffer(0, travelerBuffer);

      pass.draw(3);

      renderer.countDraw(3);
    },

    reset() {
      // ------------------------------------------------------
      // RESET PART A
      // ------------------------------------------------------

      state.tx = 0;
      state.ty = 0;
      state.tz = 0.6;

      state.rx = Math.PI / 6;
      state.ry = Math.PI / 4;
      state.rz = 0;

      state.sx = 0.3;
      state.sy = 0.3;
      state.sz = 0.3;

      state.trs = true;

      // ------------------------------------------------------
      // RESET PART B
      // ------------------------------------------------------

      animationAngle = 0;
      travelU = 0;

      // ------------------------------------------------------
      // RESET PART D
      // ------------------------------------------------------

      state.t = 0.5;
      state.showCatmull = false;
      state.showConstruction = true;
      state.animateCurve = true;
      state.editPoints = false;

      for (let i = 0; i < anchors.length; i++) {
        anchors[i].splice(
          0,
          3,
          ...initialAnchors[i]
        );
      }

      firstHandle.splice(
        0,
        3,
        ...initialFirstHandle
      );

      for (let i = 0; i < endHandles.length; i++) {
        endHandles[i].splice(
          0,
          3,
          ...initialEndHandles[i]
        );
      }

      activeHandle = null;
      curveDirty = true;

      // ------------------------------------------------------
      // UPDATE UI
      // ------------------------------------------------------

      txSlider.update();
      tySlider.update();
      tzSlider.update();

      rxSlider.update();
      rySlider.update();
      rzSlider.update();

      sxSlider.update();
      sySlider.update();
      szSlider.update();

      trsToggle.update();

      tSlider.update();
      catToggle.update();
      constructionToggle.update();
      animationToggle.update();
      editToggle.update();
    }
  };
}
