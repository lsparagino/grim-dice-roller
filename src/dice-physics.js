/**
 * dice-physics.js — Cannon.js body creation for dice
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DIE_SIZE, DIE_SCALE } from './dice-constants.js';
import { DICE_GEOM } from './dice-geometry.js';

// ── Create physics body for a die ─────────────────────────
export function createDieBody(type) {
  const geomData = DICE_GEOM[type];
  const rawVerts = geomData.vertices;
  const rawFaces = geomData.faces;

  const scale = DIE_SCALE[type] || 1;
  const actualSize = DIE_SIZE * scale;

  // Build Cannon vertices (normalized and scaled to radius)
  const cannonVerts = rawVerts.map(v => {
    const vec = new THREE.Vector3(...v).normalize().multiplyScalar(actualSize);
    return new CANNON.Vec3(vec.x, vec.y, vec.z);
  });

  // Build Cannon faces (strip the material index from each face)
  const cannonFaces = rawFaces.map(f => f.slice(0, -1));

  const shape = new CANNON.ConvexPolyhedron({ vertices: cannonVerts, faces: cannonFaces });

  const body = new CANNON.Body({
    mass: 1,
    shape,
    material: new CANNON.Material({ friction: 0.5, restitution: 0.35 }),
    linearDamping: 0.4,
    angularDamping: 0.4,
  });

  body.allowSleep = true;
  body.sleepSpeedLimit = 0.15;
  body.sleepTimeLimit = 0.3;

  return body;
}
