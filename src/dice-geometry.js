/**
 * dice-geometry.js — Polyhedral geometry data and chamfered BufferGeometry builder
 * Geometry data from dice-box-threejs (MIT).
 */
import * as THREE from 'three';
import { CHAMFER } from './dice-constants.js';

// ═══════════════════════════════════════════════════════════
// GEOMETRY DATA — vertices + faces for each die type
// Last element of each face array = material index (face number)
// ═══════════════════════════════════════════════════════════
export const DICE_GEOM = {
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
export function buildDieGeometry(type, radius) {
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
