/**
 * dice3d.js — 3D dice orchestrator
 * Coordinates mesh creation, physics, and animation loop.
 * Delegates to focused modules for geometry, materials, physics, and scene.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DEBUG, DIE_SIZE, DIE_SCALE, THROW_HEIGHT, SETTLE_THRESHOLD, SETTLE_FRAMES } from './dice-constants.js';
import { DICE_GEOM, buildDieGeometry, D4_FACE_CORNERS, D4_VERTEX_LABELS } from './dice-geometry.js';
import { createEdgeMaterial, createFaceMaterial, createD4FaceMaterial } from './dice-materials.js';
import { createDieBody } from './dice-physics.js';
import {
  initScene as initSceneInternal,
  disposeScene as disposeSceneInternal,
  resizeScene as resizeSceneInternal,
  getScene, getWorld, getRenderer, getCamera, getControls,
  updateOrbitLight,
  setScoreOrbit,
  updateScoreOrbit,
} from './dice-scene.js';

// ── Module state ──────────────────────────────────────────
let animationId = null;
let isAnimating = false;
let onCompleteCallback = null;
let diceObjects = [];
let initialized = false;
let lastTime = 0;

// ═══════════════════════════════════════════════════════════
// MESH CREATION
// ═══════════════════════════════════════════════════════════
function createDieMesh(type) {
  const geomData = DICE_GEOM[type];
  if (!geomData) return null;

  const scale = DIE_SCALE[type] || 1;
  const geometry = buildDieGeometry(type, DIE_SIZE * scale);

  const numFaces = geomData.faces.length;

  // Material 0 = edge/body (no number)
  // Materials 1..N = numbered faces
  const materials = [createEdgeMaterial()];

  if (type === 'd4') {
    // D4: each face gets 3 corner numbers (vertex labels)
    for (let i = 0; i < numFaces; i++) {
      materials.push(createD4FaceMaterial(D4_FACE_CORNERS[i]));
    }
  } else {
    for (let i = 0; i < numFaces; i++) {
      materials.push(createFaceMaterial(i + 1));
    }
  }

  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

// ═══════════════════════════════════════════════════════════
// FACE VALUE DETECTION
// ═══════════════════════════════════════════════════════════
/**
 * Read which face is pointing up from a settled die mesh.
 * Uses face normals from the geometry, transformed by the mesh quaternion.
 */
function getFaceValue(dieObj) {
  const { mesh, type } = dieObj;

  // D4: the result is the vertex pointing UP, not the face pointing up
  if (type === 'd4') {
    return getD4FaceValue(mesh);
  }

  const geometry = mesh.geometry;
  const normalAttr = geometry.getAttribute('normal');
  const groups = geometry.groups;

  const upVector = new THREE.Vector3(0, 1, 0);
  let bestMaterialIndex = 1;
  let bestDot = -Infinity;

  const checked = new Set();
  for (const group of groups) {
    const matIdx = group.materialIndex;
    if (matIdx <= 0 || checked.has(matIdx)) continue;
    checked.add(matIdx);

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

  return bestMaterialIndex;
}

/**
 * D4 value detection: find which original vertex has the highest Y after rotation.
 * That vertex's label (1-4) is the die result.
 */
function getD4FaceValue(mesh) {
  const geomData = DICE_GEOM.d4;
  const upVector = new THREE.Vector3(0, 1, 0);
  let bestLabel = 1;
  let bestDot = -Infinity;

  for (let i = 0; i < geomData.vertices.length; i++) {
    const v = new THREE.Vector3(...geomData.vertices[i]).normalize();
    v.applyQuaternion(mesh.quaternion);

    const dot = v.dot(upVector);
    if (dot > bestDot) {
      bestDot = dot;
      bestLabel = D4_VERTEX_LABELS[i];
    }
  }

  return bestLabel;
}

// ═══════════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════════
function animate() {
  animationId = requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  const world = getWorld();
  const renderer = getRenderer();
  const scene = getScene();
  const camera = getCamera();
  const controls = getControls();

  if (controls) controls.update();

  // Always update the orbiting light and score camera orbit
  updateOrbitLight(dt);
  updateScoreOrbit(dt);

  // Only step physics while dice are still rolling
  if (isAnimating && world) {
    world.step(1 / 60, dt, 3);

    let allSettled = true;
    for (const d of diceObjects) {
      d.mesh.position.copy(d.body.position);
      d.mesh.quaternion.copy(d.body.quaternion);

      const speed = d.body.velocity.length() + d.body.angularVelocity.length();
      d.settledFrames = speed < SETTLE_THRESHOLD ? d.settledFrames + 1 : 0;
      if (d.settledFrames < SETTLE_FRAMES) allSettled = false;
    }

    if (allSettled && diceObjects.length > 0) {
      isAnimating = false;

      const results = diceObjects.map(d => ({
        type: d.type,
        value: getFaceValue(d),
      }));

      if (onCompleteCallback) onCompleteCallback(results);
    }
  }

  renderer.render(scene, camera);

  // Debug HUD — live camera position
  if (DEBUG && camera) {
    let hud = document.getElementById('debug-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'debug-hud';
      hud.style.cssText = 'position:fixed;top:8px;left:8px;color:#0f0;font:12px monospace;z-index:9999;background:rgba(0,0,0,0.6);padding:4px 8px;border-radius:4px;pointer-events:none;';
      document.body.appendChild(hud);
    }
    const p = camera.position;
    hud.textContent = `cam: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}]`;
  }
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════
export function initScene(canvasEl) {
  initSceneInternal(canvasEl);
  initialized = true;

  // Start the animation loop immediately (needed for orbiting light)
  if (!animationId) {
    lastTime = performance.now();
    animate();
  }
}

/**
 * Roll dice. onComplete receives an array of {type, value} with the
 * physics-determined face values.
 */
export function rollDice3D(diceList, onComplete) {
  const scene = getScene();
  const world = getWorld();
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

    // Spread starting positions across the hex mat
    const sx = (Math.random() - 0.5) * 5;
    const sz = (Math.random() - 0.5) * 5;
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

export function clearDice() {
  const scene = getScene();
  const world = getWorld();
  for (const d of diceObjects) {
    if (scene) scene.remove(d.mesh);
    if (world) world.removeBody(d.body);
    d.mesh.geometry.dispose();
    if (Array.isArray(d.mesh.material)) {
      for (const m of d.mesh.material) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  }
  diceObjects = [];
  isAnimating = false;
}

export function disposeScene() {
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  disposeSceneInternal(diceObjects);
  diceObjects = [];
  isAnimating = false;
  initialized = false;
}

export function resizeScene(canvasEl) {
  resizeSceneInternal(canvasEl);
}

export function getIsAnimating() { return isAnimating; }
export { setScoreOrbit };
