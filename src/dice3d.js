/**
 * dice3d.js — 3D dice with Cannon ES physics + Three.js rendering
 * Proper polyhedral shapes with chamfered edges, per-face numbered textures,
 * and physics bodies matching geometry.
 *
 * Geometry data from dice-box-threejs (MIT) DICE_GEOM constants.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ── Module state ──────────────────────────────────────────
let renderer, scene, camera, world;
let animationId = null;
let isAnimating = false;
let onCompleteCallback = null;
let diceObjects = [];
let initialized = false;

// ── Constants ─────────────────────────────────────────────
const GRAVITY = -50;
const FLOOR_Y = 0;
const WALL_DISTANCE = 5;
const DIE_SIZE = 0.7;
const THROW_HEIGHT = 8;
const SETTLE_THRESHOLD = 0.05;
const SETTLE_FRAMES = 30;
const CHAMFER = 0.96; // Edge chamfer factor (1 = no chamfer, 0.9 = heavy)

// ═══════════════════════════════════════════════════════════
// GEOMETRY DATA — vertices + faces for each die type
// Last element of each face array = material index (face number)
// ═══════════════════════════════════════════════════════════
const DICE_GEOM = {
  d4: {
    vertices: [[1,1,1],[-1,-1,1],[-1,1,-1],[1,-1,-1]],
    faces: [[1,0,2, 0],[0,1,3, 1],[0,3,2, 2],[1,2,3, 3]],
  },
  d6: {
    vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
    faces: [[0,3,2,1, 0],[1,2,6,5, 1],[0,1,5,4, 2],[3,7,6,2, 3],[0,4,7,3, 4],[4,5,6,7, 5]],
  },
  d8: {
    vertices: [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],
    faces: [[0,2,4, 0],[0,4,3, 1],[0,3,5, 2],[0,5,2, 3],[1,3,4, 4],[1,4,2, 5],[1,2,5, 6],[1,5,3, 7]],
  },
  d10: {
    vertices: [
      [1,0,-0.105],[0.809,0.5877,0.105],[0.309,0.951,-0.105],
      [-0.309,0.951,0.105],[-0.809,0.5877,-0.105],[-1,0,0.105],
      [-0.809,-0.587,-0.105],[-0.309,-0.951,0.105],[0.309,-0.951,-0.105],
      [0.809,-0.5877,0.105],[0,0,-1],[0,0,1]
    ],
    faces: [
      [5,6,7,11, 0],[4,3,2,10, 1],[1,2,3,11, 2],[0,9,8,10, 3],
      [7,8,9,11, 4],[8,7,6,10, 5],[9,0,1,11, 6],[2,1,0,10, 7],
      [3,4,5,11, 8],[6,5,4,10, 9]
    ],
  },
  d12: {
    vertices: [
      [0,0.618,1.618],[0,0.618,-1.618],[0,-0.618,1.618],[0,-0.618,-1.618],
      [1.618,0,0.618],[1.618,0,-0.618],[-1.618,0,0.618],[-1.618,0,-0.618],
      [0.618,1.618,0],[0.618,-1.618,0],[-0.618,1.618,0],[-0.618,-1.618,0],
      [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1]
    ],
    faces: [
      [2,14,4,12,0 ,0],[15,9,11,19,3 ,1],[16,10,17,7,6 ,2],[6,7,19,11,18 ,3],
      [6,18,2,0,16 ,4],[18,11,9,14,2 ,5],[1,17,10,8,13 ,6],[1,13,5,15,3 ,7],
      [13,8,12,4,5 ,8],[5,4,14,9,15 ,9],[0,12,8,10,16 ,10],[3,19,7,17,1 ,11]
    ],
  },
  d20: {
    vertices: [
      [-1,1.618,0],[1,1.618,0],[-1,-1.618,0],[1,-1.618,0],
      [0,-1,1.618],[0,1,1.618],[0,-1,-1.618],[0,1,-1.618],
      [1.618,0,-1],[1.618,0,1],[-1.618,0,-1],[-1.618,0,1]
    ],
    faces: [
      [0,11,5, 0],[0,5,1, 1],[0,1,7, 2],[0,7,10, 3],[0,10,11, 4],
      [1,5,9, 5],[5,11,4, 6],[11,10,2, 7],[10,7,6, 8],[7,1,8, 9],
      [3,9,4, 10],[3,4,2, 11],[3,2,6, 12],[3,6,8, 13],[3,8,9, 14],
      [4,9,5, 15],[2,4,11, 16],[6,2,10, 17],[8,6,7, 18],[9,8,1, 19]
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// CHAMFERING — creates beveled edges from polyhedron data
// Adapted from dice-box-threejs (MIT)
// ═══════════════════════════════════════════════════════════
function chamferGeom(rawVerts, rawFaces, chamfer) {
  // Normalize raw vertices into Vector3
  const vectors = rawVerts.map(v => new THREE.Vector3(...v).normalize());
  const faces = rawFaces.map(f => [...f]);

  const chamferVectors = [];
  const chamferFaces = [];
  const cornerFaces = vectors.map(() => []);

  // Create chamfered face vertices (shrunk toward face center)
  for (const face of faces) {
    const fl = face.length - 1; // exclude material index
    const center = new THREE.Vector3();
    const newFace = [];

    for (let j = 0; j < fl; j++) {
      const v = vectors[face[j]].clone();
      center.add(v);
      const idx = chamferVectors.push(v) - 1;
      newFace.push(idx);
      cornerFaces[face[j]].push(idx);
    }
    center.divideScalar(fl);

    for (let j = 0; j < fl; j++) {
      const v = chamferVectors[newFace[j]];
      v.subVectors(v, center).multiplyScalar(chamfer).addVectors(v, center);
    }
    newFace.push(face[fl]); // preserve material index
    chamferFaces.push(newFace);
  }

  // Create edge chamfer faces (quads between adjacent original faces)
  for (let i = 0; i < faces.length - 1; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const pairs = [];
      let lastm = -1;
      for (let m = 0; m < faces[i].length - 1; m++) {
        const n = faces[j].indexOf(faces[i][m]);
        if (n >= 0 && n < faces[j].length - 1) {
          if (lastm >= 0 && m !== lastm + 1) pairs.unshift([i, m], [j, n]);
          else pairs.push([i, m], [j, n]);
          lastm = m;
        }
      }
      if (pairs.length !== 4) continue;
      chamferFaces.push([
        chamferFaces[pairs[0][0]][pairs[0][1]],
        chamferFaces[pairs[1][0]][pairs[1][1]],
        chamferFaces[pairs[3][0]][pairs[3][1]],
        chamferFaces[pairs[2][0]][pairs[2][1]],
        -1, // material -1 = edge face (same color as body)
      ]);
    }
  }

  // Create corner chamfer faces
  for (let i = 0; i < cornerFaces.length; i++) {
    const cf = cornerFaces[i];
    const face = [cf[0]];
    let count = cf.length - 1;
    while (count) {
      for (let m = faces.length; m < chamferFaces.length; m++) {
        const index = chamferFaces[m].indexOf(face[face.length - 1]);
        if (index >= 0 && index < 4) {
          let prev = index - 1;
          if (prev === -1) prev = 3;
          const nextVertex = chamferFaces[m][prev];
          if (cf.indexOf(nextVertex) >= 0) {
            face.push(nextVertex);
            break;
          }
        }
      }
      --count;
    }
    face.push(-1);
    chamferFaces.push(face);
  }

  return { vectors: chamferVectors, faces: chamferFaces };
}

// ═══════════════════════════════════════════════════════════
// BUILD GEOMETRY — from chamfered vertex/face data
// ═══════════════════════════════════════════════════════════
function buildDieGeometry(type, radius) {
  const geomData = DICE_GEOM[type];
  if (!geomData) return null;

  const isD10 = type === 'd10';
  const cg = chamferGeom(geomData.vertices, geomData.faces, CHAMFER);
  const { vectors, faces } = cg;

  // Scale vertices to radius
  for (const v of vectors) {
    v.multiplyScalar(radius);
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  const geo = new THREE.BufferGeometry();
  let faceFirstVertexIndex = 0;

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const fl = face.length - 1; // vertex count (last el = matIndex)
    const matIndex = face[fl];
    const aa = (Math.PI * 2) / fl;

    // Rotation correction for text on faces
    const af = isD10 ? Math.PI : 0;
    const tab = isD10 ? 0.3 : 0;

    // Fan-triangulate the face
    for (let j = 0; j < fl - 2; j++) {
      const v0 = vectors[face[0]];
      const v1 = vectors[face[j + 1]];
      const v2 = vectors[face[j + 2]];

      positions.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v2.x, v2.y, v2.z);

      // Flat normal
      const cb = new THREE.Vector3().subVectors(v2, v1);
      const ab = new THREE.Vector3().subVectors(v0, v1);
      cb.cross(ab).normalize();
      normals.push(cb.x, cb.y, cb.z, cb.x, cb.y, cb.z, cb.x, cb.y, cb.z);

      // UVs — project onto face local circle
      if (isD10 && matIndex >= 0 && j < 2) {
        // Special kite UVs for d10
        const w = 0.65, h = 0.85;
        const v0uv = 1 - h;
        const v1uv = 1 - (0.895 / 1.105) * h;
        const v2uv = 1;
        if (j === 0) {
          uvs.push(0.5 - w / 2, v1uv, 0.5, v0uv, 0.5 + w / 2, v1uv);
        } else {
          uvs.push(0.5 - w / 2, v1uv, 0.5 + w / 2, v1uv, 0.5, v2uv);
        }
      } else {
        uvs.push(
          (Math.cos(af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(af) + 1 + tab) / 2 / (1 + tab),
          (Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
          (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
        );
      }
    }

    // Assign material groups — all triangles in this face get the same material
    const triCount = fl - 2;
    for (let t = 0; t < triCount; t++) {
      // matIndex+1 because material 0 = edge/body color
      geo.addGroup(faceFirstVertexIndex, 3, matIndex + 1);
      faceFirstVertexIndex += 3;
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  return geo;
}

// ── Create numbered canvas texture for a face ─────────────
function createFaceTexture(number, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Die body color — medium charcoal (brighter for visibility)
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(0, 0, size, size);

  // Number
  const text = String(number);
  const fontSize = text.length > 1 ? size * 0.36 : size * 0.48;
  ctx.font = `bold ${fontSize}px "Alegreya SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outline for legibility
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.strokeText(text, size / 2, size / 2);

  // White number
  ctx.fillStyle = '#e0ddd8';
  ctx.fillText(text, size / 2, size / 2);

  // Underline for 6 and 9
  if (text === '6' || text === '9') {
    const metrics = ctx.measureText(text);
    const underlineY = size / 2 + fontSize * 0.38;
    ctx.strokeStyle = '#e0ddd8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(size / 2 - metrics.width / 2, underlineY);
    ctx.lineTo(size / 2 + metrics.width / 2, underlineY);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ── Edge body material (for chamfer faces) ────────────────
function createEdgeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x333338,
    roughness: 0.35,
    metalness: 0.2,
  });
}

// ── Create die mesh ───────────────────────────────────────
function createDieMesh(type) {
  const geomData = DICE_GEOM[type];
  if (!geomData) return null;

  const geometry = buildDieGeometry(type, DIE_SIZE);

  // Count how many numbered faces (material index > 0)
  const numFaces = geomData.faces.length;

  // Material 0 = edge/body (no number)
  // Materials 1..N = numbered faces
  const materials = [createEdgeMaterial()];
  for (let i = 0; i < numFaces; i++) {
    const number = i + 1;
    const texture = createFaceTexture(number);
    materials.push(new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.45,
      metalness: 0.1,
    }));
  }

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

// ═══════════════════════════════════════════════════════════
// PHYSICS — ConvexPolyhedron shapes from raw geometry data
// ═══════════════════════════════════════════════════════════
function createDieBody(type, mass = 1) {
  const geomData = DICE_GEOM[type];
  const rawVerts = geomData.vertices;
  const rawFaces = geomData.faces;

  // Build Cannon vertices (normalized and scaled to radius)
  const cannonVerts = rawVerts.map(v => {
    const vec = new THREE.Vector3(...v).normalize().multiplyScalar(DIE_SIZE);
    return new CANNON.Vec3(vec.x, vec.y, vec.z);
  });

  // Build Cannon faces (strip the material index from each face)
  const cannonFaces = rawFaces.map(f => f.slice(0, f.length - 1));

  const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVerts, faces: cannonFaces });

  const body = new CANNON.Body({
    mass,
    shape,
    material: new CANNON.Material({ friction: 0.5, restitution: 0.5 }),
    linearDamping: 0.25,
    angularDamping: 0.25,
  });

  body.allowSleep = true;
  body.sleepSpeedLimit = 0.1;
  body.sleepTimeLimit = 0.5;

  return body;
}

// ═══════════════════════════════════════════════════════════
// SCENE SETUP
// ═══════════════════════════════════════════════════════════
export function initScene(canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 340;

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0e0e10);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e0e10, 8, 25);

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 12, 6);
  camera.lookAt(0, 0, 0);

  // Lighting — bright enough to see die faces clearly
  scene.add(new THREE.AmbientLight(0xaaaaaa, 1.2));

  const spotLight = new THREE.SpotLight(0xffffff, 2);
  spotLight.position.set(-3, 15, 5);
  spotLight.angle = Math.PI / 4;
  spotLight.penumbra = 0.5;
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(1024, 1024);
  spotLight.shadow.camera.near = 1;
  spotLight.shadow.camera.far = 30;
  scene.add(spotLight);
  scene.add(spotLight.target);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
  fillLight.position.set(5, 8, -3);
  scene.add(fillLight);

  const fillLight2 = new THREE.DirectionalLight(0xcccccc, 0.5);
  fillLight2.position.set(-5, 6, 4);
  scene.add(fillLight2);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.9, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  // Physics world — higher restitution for more bounce
  world = new CANNON.World();
  world.gravity.set(0, GRAVITY, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 14;
  world.allowSleep = true;

  const floorMat = new CANNON.Material({ friction: 0.5, restitution: 0.5 });
  const wallMat = new CANNON.Material({ friction: 0.2, restitution: 0.7 });
  const diceMat = new CANNON.Material({ friction: 0.5, restitution: 0.5 });

  // Floor surface
  const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: floorMat });
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  floorBody.position.set(0, FLOOR_Y, 0);
  world.addBody(floorBody);

  // Walls
  const addWall = (pos, axisAngle) => {
    const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wallMat });
    if (axisAngle) wall.quaternion.setFromAxisAngle(new CANNON.Vec3(...axisAngle[0]), axisAngle[1]);
    wall.position.set(...pos);
    world.addBody(wall);
  };
  addWall([0, 0, -WALL_DISTANCE], null); // Back (plane faces +Z by default)
  addWall([0, 0, WALL_DISTANCE], [[0,1,0], Math.PI]);
  addWall([-WALL_DISTANCE, 0, 0], [[0,1,0], Math.PI / 2]);
  addWall([WALL_DISTANCE, 0, 0], [[0,1,0], -Math.PI / 2]);

  // Contact materials — dice vs floor and dice vs dice
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.5, restitution: 0.5 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.4, restitution: 0.4 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wallMat, diceMat, { friction: 0.2, restitution: 0.7 }));

  renderer.render(scene, camera);
  initialized = true;
}

// ═══════════════════════════════════════════════════════════
// ROLLING
// ═══════════════════════════════════════════════════════════
/**
 * Read which face is pointing up from a settled die mesh.
 * Uses face normals from the geometry, transformed by the mesh quaternion.
 */
function getFaceValue(dieObj) {
  const { mesh } = dieObj;
  const geometry = mesh.geometry;
  const normalAttr = geometry.getAttribute('normal');
  const groups = geometry.groups;

  const upVector = new THREE.Vector3(0, 1, 0);
  let bestMaterialIndex = 1;
  let bestDot = -Infinity;

  // For each group, check if its face normal (in world space) points up
  const checked = new Set();
  for (const group of groups) {
    const matIdx = group.materialIndex;
    if (matIdx <= 0 || checked.has(matIdx)) continue; // skip edge faces (matIdx 0 or -1+1=0)
    checked.add(matIdx);

    // Get the normal of the first vertex in this group
    const startVtx = group.start;
    const nx = normalAttr.getX(startVtx);
    const ny = normalAttr.getY(startVtx);
    const nz = normalAttr.getZ(startVtx);

    const worldNormal = new THREE.Vector3(nx, ny, nz);
    worldNormal.applyQuaternion(mesh.quaternion).normalize();

    const dot = worldNormal.dot(upVector);
    if (dot > bestDot) {
      bestDot = dot;
      bestMaterialIndex = matIdx;
    }
  }

  // Material index N+1 maps to face number N+1
  // (materialIndex 0 = edge, 1 = face "1", etc.)
  return bestMaterialIndex;
}

/**
 * Roll dice. onComplete receives an array of {type, value} with the
 * physics-determined face values.
 */
export function rollDice3D(diceList, onComplete) {
  if (!scene || !world) return;
  isAnimating = true;
  onCompleteCallback = onComplete;

  // Clear previous dice
  for (const d of diceObjects) {
    scene.remove(d.mesh);
    world.removeBody(d.body);
    d.mesh.geometry.dispose();
    if (Array.isArray(d.mesh.material)) {
      for (const m of d.mesh.material) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  }
  diceObjects = [];

  for (const die of diceList) {
    const mesh = createDieMesh(die.type);
    const body = createDieBody(die.type);

    // Spread starting positions
    const sx = (Math.random() - 0.5) * 4;
    const sz = (Math.random() - 0.5) * 4;
    const sy = THROW_HEIGHT + Math.random() * 3;
    body.position.set(sx, sy, sz);

    // Random rotation
    const axis = new CANNON.Vec3(Math.random(), Math.random(), Math.random());
    axis.normalize();
    body.quaternion.setFromAxisAngle(axis, Math.random() * Math.PI * 2);

    // Throw velocity
    body.velocity.set(
      (Math.random() - 0.5) * 8,
      -2 - Math.random() * 4,
      (Math.random() - 0.5) * 8,
    );

    // Random spin
    body.angularVelocity.set(
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 25,
      (Math.random() - 0.5) * 25,
    );

    scene.add(mesh);
    world.addBody(body);
    diceObjects.push({ mesh, body, type: die.type, settledFrames: 0 });
  }

  if (!animationId) {
    lastTime = performance.now();
    animate();
  }
}

let lastTime = 0;

function animate() {
  animationId = requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  world.step(1 / 60, dt, 3);

  let allSettled = true;
  for (const d of diceObjects) {
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);

    const speed = d.body.velocity.length() + d.body.angularVelocity.length();
    d.settledFrames = speed < SETTLE_THRESHOLD ? d.settledFrames + 1 : 0;
    if (d.settledFrames < SETTLE_FRAMES) allSettled = false;
  }

  renderer.render(scene, camera);

  if (allSettled && diceObjects.length > 0) {
    cancelAnimationFrame(animationId);
    animationId = null;
    isAnimating = false;

    // Read face values from physics-settled orientations
    const results = diceObjects.map(d => ({
      type: d.type,
      value: getFaceValue(d),
    }));

    if (onCompleteCallback) onCompleteCallback(results);
  }
}

// ═══════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════
export function disposeScene() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  for (const d of diceObjects) {
    scene.remove(d.mesh);
    world.removeBody(d.body);
    d.mesh.geometry.dispose();
    if (Array.isArray(d.mesh.material)) {
      for (const m of d.mesh.material) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  }
  diceObjects = [];
  if (renderer) { renderer.dispose(); renderer = null; }
  scene = null; camera = null; world = null;
  isAnimating = false; initialized = false;
}

export function resizeScene(canvasEl) {
  if (!renderer || !camera) return;
  const rect = canvasEl.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

export function getIsAnimating() { return isAnimating; }
