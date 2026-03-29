/**
 * dice-scene.js — Three.js scene, renderer, camera, lighting, hex mat, and physics world
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import {
  DEBUG, GRAVITY, FLOOR_Y, MAT_RADIUS, BORDER_HEIGHT, MAT_REFLECTIVITY,
  MAT_ROUGHNESS, MAT_METALNESS, MAT_COLOR,
  CAMERA_POS, SCORE_ORBIT_SPEED,
  ORBIT_LIGHT_COUNT, ORBIT_LIGHT_SPEED, ORBIT_LIGHT_INTENSITY, ORBIT_LIGHT_HEIGHT, ORBIT_LIGHT_COLOR, ORBIT_LIGHT_DISTANCE,
  AMBIENT_INTENSITY, MAIN_LIGHT_INTENSITY, MAIN_LIGHT_COLOR, MAIN_LIGHT_POS,
  FILL_LIGHT_1_INTENSITY, FILL_LIGHT_2_INTENSITY,
} from './dice-constants.js';

// ── Module state ──────────────────────────────────────────
let renderer = null;
let scene = null;
let camera = null;
let world = null;
let controls = null;
let orbitLights = []; // Array of {light, angle, speed, radius, height}
let scoreOrbiting = false; // Whether the camera is auto-orbiting for score view
let scoreOrbitAngle = 0; // Current orbit angle

export function getRenderer() { return renderer; }
export function getScene() { return scene; }
export function getCamera() { return camera; }
export function getWorld() { return world; }
export function getControls() { return controls; }

// Score orbit — slow counterclockwise camera rotation when score is shown
export function setScoreOrbit(active) {
  scoreOrbiting = active;
  if (active) {
    // Calculate initial angle from current camera position
    scoreOrbitAngle = Math.atan2(camera.position.z, camera.position.x);
  }
}
export function updateScoreOrbit(dt) {
  if (!scoreOrbiting || !camera) return;
  const radius = Math.sqrt(CAMERA_POS[0] ** 2 + CAMERA_POS[2] ** 2);
  const height = CAMERA_POS[1];
  scoreOrbitAngle += SCORE_ORBIT_SPEED * dt; // counterclockwise
  camera.position.x = Math.cos(scoreOrbitAngle) * radius;
  camera.position.z = Math.sin(scoreOrbitAngle) * radius;
  camera.position.y = height;
  camera.lookAt(0, 0, 0);
}

// Update all orbiting lights each frame
export function updateOrbitLight(dt) {
  for (const ol of orbitLights) {
    ol.angle -= ol.speed * dt;
    // Orbit on a tilted plane: compute position in local XZ, then rotate by tilt
    const x = Math.cos(ol.angle) * ol.radius;
    const z = Math.sin(ol.angle) * ol.radius;
    // Apply tilt rotation around the Y-rotated axis
    const cosTilt = Math.cos(ol.tilt);
    const sinTilt = Math.sin(ol.tilt);
    const cosAxis = Math.cos(ol.tiltAxis);
    const sinAxis = Math.sin(ol.tiltAxis);
    // Rotate (x, 0, z) around a horizontal axis defined by tiltAxis
    const localX = x * cosAxis - z * sinAxis;
    const localZ = x * sinAxis + z * cosAxis;
    const finalX = localX;
    const finalY = localZ * sinTilt;
    const finalZ = localZ * cosTilt;
    // Rotate back
    ol.light.position.x = finalX * cosAxis + finalZ * sinAxis;
    ol.light.position.y = FLOOR_Y + ol.height + finalY;
    ol.light.position.z = -finalX * sinAxis + finalZ * cosAxis;
  }
}

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
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(...CAMERA_POS);
  camera.lookAt(0, 0, 0);
  camera.layers.enable(1); // See orbit PointLights (layer 1)
  camera.layers.enable(2); // See light helper spheres (layer 2)

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

  // ── Lighting ────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x888888, AMBIENT_INTENSITY));

  const mainLight = new THREE.DirectionalLight(MAIN_LIGHT_COLOR, MAIN_LIGHT_INTENSITY);
  mainLight.position.set(...MAIN_LIGHT_POS);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.near = 0.5;
  mainLight.shadow.camera.far = 30;
  mainLight.shadow.camera.left = -8;
  mainLight.shadow.camera.right = 8;
  mainLight.shadow.camera.top = 8;
  mainLight.shadow.camera.bottom = -8;
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xaaaaaa, FILL_LIGHT_1_INTENSITY);
  fillLight.position.set(-5, 8, -3);
  scene.add(fillLight);

  const fillLight2 = new THREE.DirectionalLight(0x999999, FILL_LIGHT_2_INTENSITY);
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

  // Dark base surface underneath — completely unlit, just provides MAT_COLOR
  // The Reflector on top handles all visual interest (reflections)
  const baseMatSurface = new THREE.Mesh(
    new THREE.ShapeGeometry(hexShape),
    new THREE.MeshBasicMaterial({ color: MAT_COLOR }),
  );
  baseMatSurface.rotation.x = -Math.PI / 2;
  baseMatSurface.position.y = FLOOR_Y - 0.001;
  baseMatSurface.receiveShadow = true;
  scene.add(baseMatSurface);

  // Reflector surface — real-time mirror reflection of dice/scene
  // Uses a custom shader with opacity support for MAT_REFLECTIVITY control
  const reflectorGeom = new THREE.ShapeGeometry(hexShape);
  const customReflectorShader = {
    name: 'ReflectorShaderOpacity',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      reflectOpacity: { value: MAT_REFLECTIVITY },
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = textureMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float reflectOpacity;
      varying vec4 vUv;
      #include <logdepthbuf_pars_fragment>
      float blendOverlay( float base, float blend ) {
        return( base < 0.5 ? ( 2.0 * base * blend ) : ( 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - blend ) ) );
      }
      vec3 blendOverlay( vec3 base, vec3 blend ) {
        return vec3( blendOverlay( base.r, blend.r ), blendOverlay( base.g, blend.g ), blendOverlay( base.b, blend.b ) );
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec4 base = texture2DProj( tDiffuse, vUv );
        gl_FragColor = vec4( blendOverlay( base.rgb, color ), reflectOpacity );
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
  const matReflector = new Reflector(reflectorGeom, {
    color: new THREE.Color(0xffffff),
    textureWidth: 512,
    textureHeight: 512,
    clipBias: 0.003,
    shader: customReflectorShader,
  });
  matReflector.rotation.x = -Math.PI / 2;
  matReflector.position.y = FLOOR_Y;
  matReflector.material.transparent = true;

  scene.add(matReflector);

  // Logo overlay centered on the mat
  const textureLoader = new THREE.TextureLoader();
  const logoTexture = textureLoader.load('/logo.png');
  logoTexture.colorSpace = THREE.SRGBColorSpace;

  const logoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(4, 4),
    new THREE.MeshStandardMaterial({
      map: logoTexture,
      transparent: true,
      opacity: 0.15,
      roughness: 0.9,
      metalness: 0,
      emissive: 0xffffff,
      emissiveMap: logoTexture,
      emissiveIntensity: 1.5,
      depthWrite: false,
    }),
  );
  logoPlane.rotation.x = -Math.PI / 2;
  logoPlane.position.y = FLOOR_Y + 0.001;
  logoPlane.receiveShadow = false;
  scene.add(logoPlane);

  // ── Orbiting edge lights ─────────────────────────────────
  orbitLights = [];
  for (let i = 0; i < ORBIT_LIGHT_COUNT; i++) {
    const light = new THREE.PointLight(ORBIT_LIGHT_COLOR, ORBIT_LIGHT_INTENSITY, 18, 1.2);
    // Randomize orbit parameters
    const startAngle = (Math.PI * 2 / ORBIT_LIGHT_COUNT) * i + Math.random() * 0.5;
    const speedVariation = 0.7 + Math.random() * 0.6; // 0.7x to 1.3x base speed
    const radiusVariation = ORBIT_LIGHT_DISTANCE + (Math.random() - 0.5) * 1.5;
    const heightVariation = ORBIT_LIGHT_HEIGHT + (Math.random() - 0.5) * 1.0;

    light.position.set(
      Math.cos(startAngle) * radiusVariation,
      FLOOR_Y + heightVariation,
      Math.sin(startAngle) * radiusVariation,
    );
    light.castShadow = false; // Shadows disabled for perf — 12 PointLight shadows = 72 cubemap passes/frame
    light.layers.set(1); // Layer 1 = visible to main camera but not Reflector
    scene.add(light);

    // Small glowing sphere to visualize the light trace
    const helper = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      new THREE.MeshBasicMaterial({ color: ORBIT_LIGHT_COLOR }),
    );
    helper.layers.set(2); // Visible to main camera (layer 2) but not Reflector (layer 0)
    light.add(helper);

    orbitLights.push({
      light,
      angle: startAngle,
      speed: ORBIT_LIGHT_SPEED * speedVariation,
      radius: radiusVariation,
      height: heightVariation,
      tilt: Math.random() * Math.PI * 0.4,        // 0 to ~72° tilt from horizontal
      tiltAxis: Math.random() * Math.PI * 2,       // random axis direction
    });
  }

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
    new THREE.MeshStandardMaterial({
      color: MAT_COLOR,
      roughness: MAT_ROUGHNESS,
      metalness: MAT_METALNESS,
      envMap,
      envMapIntensity: MAT_REFLECTIVITY * 2,
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

  const floorMat = new CANNON.Material({ friction: 0.5, restitution: 0.35 });
  const wallMat = new CANNON.Material({ friction: 0.3, restitution: 0.3 });
  const diceMat = new CANNON.Material({ friction: 0.5, restitution: 0.35 });

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
  world.addContactMaterial(new CANNON.ContactMaterial(floorMat, diceMat, { friction: 0.5, restitution: 0.35 }));
  world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.4, restitution: 0.3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wallMat, diceMat, { friction: 0.3, restitution: 0.3 }));

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
