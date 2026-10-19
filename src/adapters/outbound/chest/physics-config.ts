import type { BoxCollider, Pose, Vec3 } from './physics-world-port.ts';

export const PHYSICS_CONFIG = Object.freeze({
  gravity: Object.freeze({ x: 0.12, y: -9.81, z: 0.12 }),
  floorHalfExtents: Object.freeze({ x: 10, y: 0.025, z: 10 }),
  chestRestitution: 0.3,
  floorRestitution: 1,
  friction: 1,
});

const tilt = 5 * Math.PI / 180;
export const SPAWN_POSE: Pose = Object.freeze({
  position: Object.freeze({ x: 0, y: 3.3, z: 0 }),
  rotation: Object.freeze({ x: Math.sin(tilt / 2), y: 0, z: 0, w: Math.cos(tilt / 2) }),
});

/** The preview fall: high in the sky, turned a little, tipped just enough to land on one edge and rock back flat. */
const lean = 1.5 * Math.PI / 180, twist = 14 * Math.PI / 180;
export const PREVIEW_DROP_POSE: Pose = Object.freeze({
  position: Object.freeze({ x: 0, y: 7, z: 0 }),
  rotation: Object.freeze({ x: Math.sin(lean / 2) * Math.cos(twist / 2), y: Math.cos(lean / 2) * Math.sin(twist / 2), z: Math.sin(lean / 2) * Math.sin(twist / 2), w: Math.cos(lean / 2) * Math.cos(twist / 2) }),
});

export function assertChestDefinition(colliders: readonly BoxCollider[], pose: Pose): void {
  if (colliders.length === 0) throw new Error('The chest must have at least one collider.');
  assertVector(pose.position);
  assertVector(pose.rotation);
  const length = Math.hypot(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-6) {
    throw new Error('The chest rotation must be a normalized quaternion.');
  }
  for (const collider of colliders) {
    assertVector(collider.center);
    assertVector(collider.halfExtents);
    if (Math.min(collider.halfExtents.x, collider.halfExtents.y, collider.halfExtents.z) <= 0) {
      throw new Error('Collider half extents must be positive.');
    }
  }
}

function assertVector(vector: Vec3): void {
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error('Physics vectors must be finite.');
  }
}
