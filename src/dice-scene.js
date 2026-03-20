/**
 * dice-scene.js — Three.js scene, renderer, camera, lighting, hex mat, and physics world
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DEBUG, GRAVITY, FLOOR_Y, MAT_RADIUS, BORDER_HEIGHT, MAT_REFLECTIVITY } from './dice-constants.js';

// ── Module state ──────────────────────────────────────────
let renderer = null;
let scene = null;
let camera = null;
let world = null;
let controls = null;

export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getWorld() { return world; }
export function getControls() { return controls; }

// ── Scene initialization ──────────────────────────────────
export function initScene(canvasEl) {
  const rect = canvasEl.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 340;

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x0a0a12);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 12, 6);
  camera.lookAt(0, 0, 0);

  // ── OrbitControls — mouse zoom/rotate/pan (DEBUG only) ───
  if (DEBUG) {
    controls = new OrbitControls(camera, canvasEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.minDistance = 3;
    controls.maxDistance = 25;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
  }

  // ── Lighting — a bit brighter ────────────────────────────
  scene.add(new THREE.AmbientLight(0x888888, 1.6));

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
  mainLight.position.set(0, 15, 5);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 30;
  mainLight.shadow.camera.left = -8;
  mainLight.shadow.camera.right = 8;
  mainLight.shadow.camera.top = 8;
  mainLight.shadow.camera.bottom = -8;
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xaaaaaa, 0.8);
  fillLight.position.set(-5, 8, -3);
  scene.add(fillLight);

  const fillLight2 = new THREE.DirectionalLight(0x999999, 0.6);
  fillLight2.position.set(5, 6, 4);
  scene.add(fillLight2);

  // ── Night sky environment map ──────────────────────────
  // Pure black sky with white stars — 1024px per face, 160 stars
  function createNightSkyFace(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Pure black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, size, size);

    // Scatter white stars of varying brightness and size
    for (let s = 0; s < 160; s++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 1.5 + 0.4;
      const brightness = Math.floor(Math.random() * 155 + 100);
      ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${Math.random() * 0.6 + 0.4})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvas;
  }

  const cubeTextures = [];
  for (let i = 0; i < 6; i++) {
    cubeTextures.push(createNightSkyFace());
  }
  const cubeTexture = new THREE.CubeTexture(cubeTextures);
  cubeTexture.needsUpdate = true;

  scene.background = cubeTexture;

  // Generate PMREM env map from the night sky for reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envMap = pmremGenerator.fromCubemap(cubeTexture).texture;
  pmremGenerator.dispose();

  // ── Hexagonal mat ──────────────────────────────────────
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    hexPoints.push(new THREE.Vector2(Math.cos(angle) * MAT_RADIUS, Math.sin(angle) * MAT_RADIUS));
  }
  const hexShape = new THREE.Shape(hexPoints);

  // Mat surface — very dark with reflections of the starry sky
  const matSurface = new THREE.Mesh(
    new THREE.ShapeGeometry(hexShape),
    new THREE.MeshStandardMaterial({
      color: 0x020202,
      roughness: 1 - MAT_REFLECTIVITY,
      metalness: 0.6,
      envMap,
      envMapIntensity: MAT_REFLECTIVITY * 6,
    }),
  );
  matSurface.rotation.x = -Math.PI / 2;
  matSurface.position.y = FLOOR_Y;
  matSurface.receiveShadow = true;
  scene.add(matSurface);

  // Logo overlay centered on the mat
  const textureLoader = new THREE.TextureLoader();
  const logoTexture = textureLoader.load('/logo.png');
  logoTexture.colorSpace = THREE.SRGBColorSpace;

  const logoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardMaterial({
      map: logoTexture,
      transparent: true,
      opacity: 0.12,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
    }),
  );
  logoPlane.rotation.x = -Math.PI / 2;
  logoPlane.position.y = FLOOR_Y + 0.001;
  logoPlane.receiveShadow = false;
  scene.add(logoPlane);

  // Raised border — extruded hexagon ring
  const innerRadius = MAT_RADIUS - 0.15;
  const innerHexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    innerHexPoints.push(new THREE.Vector2(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius));
  }
  const borderShape = new THREE.Shape(hexPoints);
  borderShape.holes.push(new THREE.Path(innerHexPoints));

  const borderGeom = new THREE.ExtrudeGeometry(borderShape, {
    depth: BORDER_HEIGHT,
    bevelEnabled: false,
  });
  const borderMesh = new THREE.Mesh(
    borderGeom,
    new THREE.MeshPhongMaterial({
      color: 0x0a0a0a,
      specular: 0x333333,
      shininess: 70,
    }),
  );
  borderMesh.rotation.x = -Math.PI / 2;
  borderMesh.position.y = FLOOR_Y;
  borderMesh.castShadow = true;
  borderMesh.receiveShadow = true;
  scene.add(borderMesh);



  // ── Physics world ──────────────────────────────────────
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

  // Hexagonal border walls — 6 wall planes at edge midpoints facing inward
  for (let i = 0; i < 6; i++) {
    const edgeAngle = (Math.PI / 3) * i;
    const apothem = innerRadius * Math.cos(Math.PI / 6);
    const wx = Math.cos(edgeAngle) * apothem;
    const wz = Math.sin(edgeAngle) * apothem;

    const wallBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: wallMat });
    // CANNON.Plane default normal is +Z (0,0,1).
    // Rotating around Y by θ gives normal = (sin(θ), 0, cos(θ)).
    // We want inward normal = (-cos(edgeAngle), 0, -sin(edgeAngle))
    // => θ = -(edgeAngle + π/2)
    wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -(edgeAngle + Math.PI / 2));
    wallBody.position.set(wx, BORDER_HEIGHT / 2, wz);
    world.addBody(wallBody);
  }

  // Contact materials
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.5, restitution: 0.5 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.4, restitution: 0.4 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wallMat, diceMat, { friction: 0.2, restitution: 0.7 }));

  renderer.render(scene, camera);
}

// ── Cleanup ───────────────────────────────────────────────
export function disposeScene(diceObjects) {
  for (const d of diceObjects) {
    scene.remove(d.mesh);
    world.removeBody(d.body);
    d.mesh.geometry.dispose();
    if (Array.isArray(d.mesh.material)) {
      for (const m of d.mesh.material) { if (m.map) m.map.dispose(); m.dispose(); }
    }
  }
  if (controls) { controls.dispose(); controls = null; }
  if (renderer) { renderer.dispose(); renderer = null; }
  scene = null; camera = null; world = null;
}

// ── Resize handler ────────────────────────────────────────
export function resizeScene(canvasEl) {
  if (!renderer || !camera) return;
  const rect = canvasEl.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
