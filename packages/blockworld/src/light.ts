import type { BlockRegistry } from './blocks.ts';
import type { BlockWorld } from './world.ts';

/**
 * Light levels the way Minecraft spreads them, 0..15 per cell:
 * - sky light comes straight down at 15 until something opaque stops it (transparent blocks such as
 *   leaves take 1), then spreads sideways and under overhangs, losing 1 per block;
 * - block light floods out from glowing blocks (a torch gives 14), losing 1 per block.
 * Opaque cubes stop both. Run once after the world is built, before meshing.
 */
export function computeLight(world: BlockWorld, registry: BlockRegistry): void {
  const { sx, sy, sz } = world;
  world.sky.fill(0); world.glow.fill(0);
  const opaque = (x: number, y: number, z: number) => registry.get(world.get(x, y, z))?.opaque ?? false;
  const filter = (x: number, y: number, z: number) => { const block = registry.get(world.get(x, y, z)); return block && block.transparent && block.model === 'cube' ? 1 : 0; };

  // Sky light straight down each column.
  const skyQueue: number[] = [];
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    let level = 15;
    for (let y = sy - 1; y >= 0 && level > 0; y--) {
      if (opaque(x, y, z)) break;
      level -= filter(x, y, z);
      world.sky[world.index(x, y, z)] = level;
      skyQueue.push(x, y, z);
    }
  }
  spread(world, world.sky, skyQueue, opaque);

  // Block light from every glowing block.
  const glowQueue: number[] = [];
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
    const level = registry.get(world.get(x, y, z))?.light ?? 0;
    if (level > 0) { world.glow[world.index(x, y, z)] = level; glowQueue.push(x, y, z); }
  }
  spread(world, world.glow, glowQueue, opaque);
}

const STEPS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** Breadth-first flood: each cell passes its level minus one to non-opaque neighbours that have less. */
function spread(world: BlockWorld, levels: Uint8Array, queue: number[], opaque: (x: number, y: number, z: number) => boolean): void {
  for (let head = 0; head < queue.length; head += 3) {
    const x = queue[head]!, y = queue[head + 1]!, z = queue[head + 2]!;
    const next = levels[world.index(x, y, z)]! - 1;
    if (next <= 0) continue;
    for (const [dx, dy, dz] of STEPS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!world.inside(nx, ny, nz) || opaque(nx, ny, nz)) continue;
      const index = world.index(nx, ny, nz);
      if (levels[index]! >= next) continue;
      levels[index] = next;
      queue.push(nx, ny, nz);
    }
  }
}
