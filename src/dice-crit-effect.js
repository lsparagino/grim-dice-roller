/**
 * dice-crit-effect.js — Critical hit visual effects for max-value dice
 *
 * When a die lands on its maximum value, its face materials are replaced with
 * a custom shader that:
 *   1. Renders a procedural cracked-rock texture over the base face
 *   2. Emits a pulsating white glow from the number engravings
 *   3. Adds a PointLight below the die mesh for atmospheric illumination
 */
import * as THREE from 'three';
import { diceMax } from './dice-icons.js';
import { D4_FACE_CORNERS } from './dice-geometry.js';

// ── Track active crit effects for animation ──────────────
const activeCritDice = []; // Array of { mesh, light, uniforms[] }

/**
 * Check each die result and apply the crit glow effect if it rolled max.
 * @param {Array<{mesh, body, type, settledFrames}>} diceObjects
 * @param {Array<{type, value}>} results
 * @param {THREE.Scene} scene
 */
export function applyCritEffects(diceObjects, results, scene) {
  for (let i = 0; i < results.length; i++) {
    const { type, value } = results[i];
    const maxVal = diceMax[type];

    if (value !== maxVal) continue;

    const dieObj = diceObjects[i];
    const mesh = dieObj.mesh;

    // Create the crit shader materials and replace face materials
    const uniforms = replaceMaterialsWithCrit(mesh, type);

    // Add a glowing PointLight parented to the mesh
    const light = new THREE.PointLight(0xffeedd, 0, 12, 1.5);
    light.position.set(0, 0.5, 0);
    mesh.add(light);

    activeCritDice.push({ mesh, light, uniforms });
  }
}

/**
 * Update pulsating glow animation each frame.
 * @param {number} dt delta time in seconds
 */
export function updateCritEffects(dt) {
  for (const crit of activeCritDice) {
    // Update all uniforms
    for (const u of crit.uniforms) {
      u.uTime.value += dt;
    }

    // Pulsate the point light intensity
    const t = crit.uniforms[0]?.uTime.value || 0;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);
    crit.light.intensity = 40 + pulse * 40;
  }
}

/**
 * Clear all active crit effects (call before new roll).
 */
export function clearCritEffects() {
  for (const crit of activeCritDice) {
    if (crit.light.parent) {
      crit.light.parent.remove(crit.light);
    }
    crit.light.dispose();
  }
  activeCritDice.length = 0;
}

// ── Internal: create crit shader materials ───────────────

/**
 * Generate a canvas texture with the number drawn in white on transparent background.
 * This serves as the "glow mask" — white where numbers are, black elsewhere.
 */
function createNumberMask(number, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Fully black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Number in white
  const text = String(number);
  const fontSize = text.length > 1 ? size * 0.25 : size * 0.31;
  ctx.font = `bold ${fontSize}px "Alegreya SC", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Slightly wider strokes for the glow mask (so glow bleeds around edges)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeText(text, size / 2, size / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, size / 2, size / 2);

  // Underline for 6 and 9
  if (text === '6' || text === '9') {
    const metrics = ctx.measureText(text);
    const underlineY = size / 2 + fontSize * 0.36;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(size / 2 - metrics.width / 2, underlineY);
    ctx.lineTo(size / 2 + metrics.width / 2, underlineY);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generate a d4 number mask (3 corner numbers).
 */
function createD4NumberMask(cornerNumbers, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  const uvVerts = [];
  for (let i = 0; i < 3; i++) {
    const angle = (Math.PI * 2 / 3) * i;
    uvVerts.push({
      u: (Math.cos(angle) + 1) / 2,
      v: (Math.sin(angle) + 1) / 2,
    });
  }

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
    const x = (uv.u + (center.u - uv.u) * inset) * size;
    const y = (uv.v + (center.v - uv.v) * inset) * size;

    const oppA = uvVerts[(i + 1) % 3];
    const oppB = uvVerts[(i + 2) % 3];
    const midU = (oppA.u + oppB.u) / 2;
    const midV = (oppA.v + oppB.v) / 2;
    const dx = uv.u - midU;
    const dy = uv.v - midV;
    const rotation = Math.atan2(dx, -dy);

    const text = String(cornerNumbers[i]);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 0, 0);

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// ── Shared GLSL noise library (3D) ─────────────────────────
// Injected into both face and edge fragment shaders
const glslNoise3D = /* glsl */`
// 3D hash → float
float hash31(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

// 3D hash → vec3
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

// 3D value noise
float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
    f.z);
}

// 3D FBM
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// 3D Voronoi — returns vec2(d1, d2) (closest, 2nd closest distances)
vec2 voronoi3(vec3 p) {
  vec3 g = floor(p);
  vec3 f = fract(p);
  float d1 = 1.0, d2 = 1.0;

  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + hash33(g + o) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; }
    else if (d < d2) { d2 = d; }
  }

  return vec2(sqrt(d1), sqrt(d2));
}

// Domain-warped organic cracks in 3D
// Returns: x = hard crack (sharp line), y = soft glow (wider falloff)
vec2 organicCracks(vec3 p, float scale) {
  // Domain warp: distort position with FBM for irregular, organic shapes
  vec3 warp = vec3(
    fbm3(p * 2.0 + vec3(0.0, 3.7, 1.2)),
    fbm3(p * 2.0 + vec3(5.2, 1.3, 0.0)),
    fbm3(p * 2.0 + vec3(2.8, 0.0, 4.1))
  );
  vec3 warped = p * scale + warp * 1.2;

  vec2 v = voronoi3(warped);
  float edge = v.y - v.x;

  // Sharp crack line
  float crack = 1.0 - smoothstep(0.0, 0.12, edge);
  // Soft glow halo around cracks (wider falloff)
  float glow = 1.0 - smoothstep(0.0, 0.35, edge);

  return vec2(crack, glow);
}
`;

const critVertexShader = /* glsl */`
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vObjPosition;

void main() {
  vUv = uv;
  vObjPosition = position; // Object-space for seamless 3D patterns
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const critFragmentShader = /* glsl */`
uniform sampler2D uBaseMap;
uniform sampler2D uNumberMask;
uniform float uTime;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vObjPosition;

${glslNoise3D}

void main() {
  vec4 baseColor = texture2D(uBaseMap, vUv);
  float numberMask = texture2D(uNumberMask, vUv).r;

  // ── Keep original dark texture ───────────────────────
  vec3 rockColor = baseColor.rgb;

  // ── Organic cracks in 3D object space (seamless) ─────
  vec2 crackData = organicCracks(vObjPosition, 3.0);
  float crack = crackData.x;     // sharp line
  float crackGlow = crackData.y; // wider soft falloff

  // ── Animated turbulence energy (3D, flows through cracks) ──
  // Two FBM layers at different speeds create organic flowing energy
  vec3 turbPos = vObjPosition * 3.0;
  float turb1 = fbm3(turbPos + vec3(uTime * 0.15, uTime * 0.08, -uTime * 0.12));
  float turb2 = fbm3(turbPos * 1.3 + vec3(-uTime * 0.1, uTime * 0.2, uTime * 0.05));
  float turbulence = turb1 * 0.55 + turb2 * 0.45;
  // Strong contrast: bright blobs flowing through dark regions
  turbulence = smoothstep(0.3, 0.65, turbulence);

  // ── Crack rendering ──────────────────────────────────
  // Darken rock at crack edges for depth
  rockColor = mix(rockColor, rockColor * 0.3, crack * 0.6);

  // Glowing energy visible in the cracks, modulated by turbulence
  vec3 energyColorHot = vec3(1.0, 0.95, 0.85);  // white-hot
  vec3 energyColorWarm = vec3(0.85, 0.55, 0.2);  // warm amber
  vec3 energyColor = mix(energyColorWarm, energyColorHot, turbulence);

  // Core glow: bright energy in crack lines
  float coreEnergy = crack * turbulence;
  rockColor += energyColor * coreEnergy * 2.5;

  // Soft ambient glow around cracks (halo)
  float haloEnergy = crackGlow * turbulence * 0.4;
  rockColor += energyColor * haloEnergy;

  // ── Number glow with same turbulence ─────────────────
  float numTurb = fbm3(vObjPosition * 2.5 + vec3(uTime * 0.12, uTime * 0.08, -uTime * 0.1));
  float numEnergy = 0.5 + 0.5 * smoothstep(0.3, 0.65, numTurb);
  float glowStrength = numberMask * numEnergy;

  vec3 glowColor = mix(vec3(0.9, 0.7, 0.45), vec3(1.1, 1.05, 0.95), numTurb);
  rockColor = mix(rockColor, glowColor, glowStrength);
  rockColor += glowColor * pow(numberMask, 0.6) * 0.35 * numEnergy;

  // ── Lighting ─────────────────────────────────────────
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(vec3(0.5, 1.0, 0.3));
  float diffuse = max(dot(N, L), 0.0) * 0.4 + 0.6;
  vec3 H = normalize(V + L);
  float specular = pow(max(dot(N, H), 0.0), 60.0) * 0.3;

  float emissiveMask = max(glowStrength, coreEnergy * 0.6);
  float lightMix = 1.0 - clamp(emissiveMask, 0.0, 1.0);
  vec3 finalColor = rockColor * (diffuse * lightMix + (1.0 - lightMix)) + specular * lightMix;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// ── Edge crit shader (no number, just cracks + energy) ──

const critEdgeFragmentShader = /* glsl */`
uniform sampler2D uBaseMap;
uniform float uTime;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vObjPosition;

${glslNoise3D}

void main() {
  vec4 baseColor = texture2D(uBaseMap, vUv);
  vec3 rockColor = baseColor.rgb;

  // Same organic 3D cracks as faces
  vec2 crackData = organicCracks(vObjPosition, 3.0);
  float crack = crackData.x;
  float crackGlow = crackData.y;

  // Same turbulence energy
  vec3 turbPos = vObjPosition * 3.0;
  float turb1 = fbm3(turbPos + vec3(uTime * 0.15, uTime * 0.08, -uTime * 0.12));
  float turb2 = fbm3(turbPos * 1.3 + vec3(-uTime * 0.1, uTime * 0.2, uTime * 0.05));
  float turbulence = turb1 * 0.55 + turb2 * 0.45;
  turbulence = smoothstep(0.3, 0.65, turbulence);

  // Crack rendering
  rockColor = mix(rockColor, rockColor * 0.3, crack * 0.6);
  vec3 energyColor = mix(vec3(0.85, 0.55, 0.2), vec3(1.0, 0.95, 0.85), turbulence);
  float coreEnergy = crack * turbulence;
  rockColor += energyColor * coreEnergy * 2.0;
  float haloEnergy = crackGlow * turbulence * 0.3;
  rockColor += energyColor * haloEnergy;

  // Lighting
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vViewPosition);
  vec3 L = normalize(vec3(0.5, 1.0, 0.3));
  float diffuse = max(dot(N, L), 0.0) * 0.4 + 0.6;
  vec3 H = normalize(V + L);
  float specular = pow(max(dot(N, H), 0.0), 60.0) * 0.3;

  float emissiveMask = coreEnergy * 0.5;
  float lightMix = 1.0 - clamp(emissiveMask, 0.0, 1.0);
  vec3 finalColor = rockColor * (diffuse * lightMix + (1.0 - lightMix)) + specular * lightMix;

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

/**
 * Replace all materials on a die mesh with crit shader materials.
 * Returns the array of uniforms objects for animation updates.
 */
function replaceMaterialsWithCrit(mesh, type) {
  const materials = mesh.material; // array
  const isD4 = type === 'd4';
  const uniformsList = [];

  const newMaterials = materials.map((mat, index) => {
    const uniforms = {
      uBaseMap: { value: mat.map || new THREE.Texture() },
      uTime: { value: 0 },
    };

    if (index === 0) {
      // Edge material — cracks only, no number
      const shaderMat = new THREE.ShaderMaterial({
        uniforms: {
          ...uniforms,
        },
        vertexShader: critVertexShader,
        fragmentShader: critEdgeFragmentShader,
      });
      uniformsList.push(uniforms);
      return shaderMat;
    }

    // Face material — cracks + number glow
    let numberMask;
    if (isD4) {
      numberMask = createD4NumberMask(D4_FACE_CORNERS[index - 1]);
    } else {
      numberMask = createNumberMask(index);
    }

    const faceUniforms = {
      uBaseMap: { value: mat.map || new THREE.Texture() },
      uNumberMask: { value: numberMask },
      uTime: { value: 0 },
    };

    const shaderMat = new THREE.ShaderMaterial({
      uniforms: faceUniforms,
      vertexShader: critVertexShader,
      fragmentShader: critFragmentShader,
    });

    uniformsList.push(faceUniforms);
    return shaderMat;
  });

  mesh.material = newMaterials;
  return uniformsList;
}
