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
