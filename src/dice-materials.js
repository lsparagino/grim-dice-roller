/**
 * dice-materials.js — Texture loading and material creation for dice faces
 */
import * as THREE from 'three';
import { BG_TEXTURE_SCALE, DICE_SHININESS } from './dice-constants.js';

// ── Shared bg.jpg texture for dice specular map (loaded once) ─
let bgTextureForDice = null;
let bgImageForCanvas = null;

export function getDiceBgTexture() {
  if (!bgTextureForDice) {
    const loader = new THREE.TextureLoader();
    bgTextureForDice = loader.load('/bg.jpg');
    bgTextureForDice.colorSpace = THREE.SRGBColorSpace;
    bgTextureForDice.wrapS = THREE.RepeatWrapping;
    bgTextureForDice.wrapT = THREE.RepeatWrapping;
    bgTextureForDice.repeat.set(1 / BG_TEXTURE_SCALE, 1 / BG_TEXTURE_SCALE);
  }
  return bgTextureForDice;
}

// Load bg.jpg as an HTML Image for canvas compositing
function loadBgImageForCanvas() {
  if (!bgImageForCanvas) {
    bgImageForCanvas = new Image();
    bgImageForCanvas.src = '/bg.jpg';
  }
  return bgImageForCanvas;
}
// Pre-load it immediately
loadBgImageForCanvas();

// ── Create numbered canvas texture for a face ─────────────
export function createFaceTexture(number, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // bg.jpg as full-opacity base layer — tiled at BG_TEXTURE_SCALE
  const bgImg = loadBgImageForCanvas();
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    // Draw bg.jpg scaled up — BG_TEXTURE_SCALE=4 means texture is 4x larger
    const drawSize = size * BG_TEXTURE_SCALE;
    ctx.drawImage(bgImg, 0, 0, drawSize, drawSize);
  } else {
    // Fallback if image not loaded yet
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, size, size);
  }

  // Number — Alegreya SC (drawn on top of texture)
  const text = String(number);
  const fontSize = text.length > 1 ? size * 0.25 : size * 0.31;
  ctx.font = `bold ${fontSize}px "Alegreya SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark outline for depth
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, size / 2, size / 2);

  // Pure white number for contrast
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, size / 2, size / 2);

  // Underline for 6 and 9
  if (text === '6' || text === '9') {
    const metrics = ctx.measureText(text);
    const underlineY = size / 2 + fontSize * 0.36;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size / 2 - metrics.width / 2, underlineY);
    ctx.lineTo(size / 2 + metrics.width / 2, underlineY);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ── Edge body material (for chamfer faces) ────────────────
export function createEdgeMaterial() {
  // Same bg.jpg base as faces, but without numbers
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const bgImg = loadBgImageForCanvas();
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    const drawSize = 256 * BG_TEXTURE_SCALE;
    ctx.drawImage(bgImg, 0, 0, drawSize, drawSize);
  } else {
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, 256, 256);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const bgTex = getDiceBgTexture();
  return new THREE.MeshPhongMaterial({
    map: texture,
    specular: 0xffffff,
    shininess: DICE_SHININESS,
    specularMap: bgTex,
  });
}

// ── Create d4 corner-numbered canvas texture ──────────────
/**
 * D4 faces show 3 numbers at the corners (one per vertex).
 * Each number is rotated so it reads upright when its vertex is at the top.
 *
 * UV mapping for triangular faces (from buildDieGeometry):
 *   vertex 0: angle=0     → UV (1.0, 0.5)    → right-center
 *   vertex 1: angle=2π/3  → UV (0.25, 0.933)  → bottom-left
 *   vertex 2: angle=4π/3  → UV (0.25, 0.067)  → top-left
 *
 * We position corner numbers inset from these UV positions and rotate each
 * so the number reads upright when its corner vertex is the topmost on the 3D die.
 */
export function createD4FaceTexture(cornerNumbers, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // bg.jpg base layer
  const bgImg = loadBgImageForCanvas();
  if (bgImg.complete && bgImg.naturalWidth > 0) {
    const drawSize = size * BG_TEXTURE_SCALE;
    ctx.drawImage(bgImg, 0, 0, drawSize, drawSize);
  } else {
    ctx.fillStyle = '#0f0f0f';
    ctx.fillRect(0, 0, size, size);
  }

  // UV positions of the 3 triangle vertices (from buildDieGeometry UV formula)
  // angle = (2π/3)*i, with af=0 for non-d10:
  //   u = (cos(angle)+1)/2,  v = (sin(angle)+1)/2
  const uvVerts = [];
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 / 3) * i;
    uvVerts.push({
      u: (Math.cos(angle) + 1) / 2,
      v: (Math.sin(angle) + 1) / 2,
    });
  }

  // Inset each vertex toward the triangle center so numbers don't clip
  const center = {
    u: (uvVerts[0].u + uvVerts[1].u + uvVerts[2].u) / 3,
    v: (uvVerts[0].v + uvVerts[1].v + uvVerts[2].v) / 3,
  };
  const inset = 0.35;

  const fontSize = size * 0.28;
  ctx.font = `bold ${fontSize}px "Alegreya SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 3; i++) {
    const uv = uvVerts[i];
    // Canvas coords (inset toward center)
    const x = (uv.u + (center.u - uv.u) * inset) * size;
    const y = (uv.v + (center.v - uv.v) * inset) * size;

    // Rotation: the number should point AWAY from the opposite edge.
    // The "up" direction for the number = from the opposite edge midpoint toward this vertex.
    const oppA = uvVerts[(i + 1) % 3];
    const oppB = uvVerts[(i + 2) % 3];
    const midU = (oppA.u + oppB.u) / 2;
    const midV = (oppA.v + oppB.v) / 2;
    // Direction from midpoint of opposite edge to this vertex (in canvas space, Y-down)
    const dx = uv.u - midU;
    const dy = uv.v - midV;
    // Rotation angle: atan2 gives angle from +X axis; we want "up" for text = -Y direction
    const rotation = Math.atan2(dx, -dy);

    const text = String(cornerNumbers[i]);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // Dark outline for depth
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, 0, 0);

    // White number
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

// ── Create face material with numbered texture ────────────
export function createFaceMaterial(number) {
  const texture = createFaceTexture(number);
  const bgTex = getDiceBgTexture();
  return new THREE.MeshPhongMaterial({
    map: texture,
    specular: 0xffffff,
    specularMap: bgTex,
    shininess: DICE_SHININESS,
  });
}

// ── Create d4 face material with corner numbers ───────────
export function createD4FaceMaterial(cornerNumbers) {
  const texture = createD4FaceTexture(cornerNumbers);
  const bgTex = getDiceBgTexture();
  return new THREE.MeshPhongMaterial({
    map: texture,
    specular: 0xffffff,
    specularMap: bgTex,
    shininess: DICE_SHININESS,
  });
}
