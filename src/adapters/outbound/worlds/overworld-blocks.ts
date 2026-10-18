import { BoxGeometry, BufferAttribute, BufferGeometry, Group, InstancedMesh, Line, LineBasicMaterial, MeshBasicMaterial, Object3D, PlaneGeometry, Mesh } from 'three';
import {
  BlockRegistry, BlockWorld, blockAtlas, computeLight, meshWorld, raw, worldMeshes, type Living, type Stage, type StageBuilder,
} from '../../../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';

/**
 * The Overworld at dusk ("Дороги Верхнего мира"), built by the rules of the game: every block one
 * cell, textured 16×16, lit by sky and torch light levels with smooth lighting and ambient
 * occlusion. A meadow with a gravel road runs up to the chest between oak and birch hills; a lake
 * on one side, snowy ranges far behind. Alive: slab clouds drift; a storm behind the ranges throws
 * lightning — its flash and thunder reach the chest through its handles.
 */
const BLOCKS = new BlockRegistry([
  { name: 'grass', textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } },
  { name: 'dirt', textures: { all: 'dirt' } },
  { name: 'stone', textures: { all: 'stone' } },
  { name: 'gravel', textures: { all: 'gravel' } },
  { name: 'sand', textures: { all: 'sand' } },
  { name: 'snow', textures: { all: 'snow' } },
  { name: 'oak_log', textures: { side: 'oak_log', top: 'oak_log_top' } },
  { name: 'oak_leaves', textures: { all: 'oak_leaves' }, transparent: true, cutout: true },
  { name: 'birch_log', textures: { side: 'birch_log', top: 'birch_log_top' } },
  { name: 'birch_leaves', textures: { all: 'birch_leaves' }, transparent: true, cutout: true },
  { name: 'pumpkin', textures: { side: 'pumpkin_side', top: 'pumpkin_top' } },
  { name: 'torch', model: 'torch', textures: { all: 'torch' }, light: 14 },
  { name: 'poppy', model: 'cross', textures: { all: 'poppy' } },
  { name: 'dandelion', model: 'cross', textures: { all: 'dandelion' } },
  { name: 'tall_grass', model: 'cross', textures: { all: 'tall_grass' } },
  { name: 'water', model: 'liquid', textures: { all: 'water' } },
]);
const id = (name: string) => BLOCKS.id(name);

const SX = 112, SY = 40, SZ = 150, OX = -56, OZ = -110, GROUND = 10;
/** The sky light at dusk: warm on the lit side of the world, as the game tints it at sunset. */
const DUSK: [number, number, number] = [1, .78, .64];

function noise(x: number, z: number, seed: number): number {
  const s = (v: number) => { const h = Math.sin(v) * 43758.5453; return h - Math.floor(h); };
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, k = (t: number) => t * t * (3 - 2 * t);
  const h = (a: number, b: number) => s(a * 127.1 + b * 311.7 + seed * 74.7);
  const top = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * k(xf), bottom = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * k(xf);
  return top + (bottom - top) * k(zf);
}
function fbm(x: number, z: number, seed: number): number {
  let sum = 0, amp = 1, total = 0, f = 1;
  for (let i = 0; i < 4; i++) { sum += noise(x * f, z * f, seed + i * 13) * amp; total += amp; amp *= .5; f *= 2; }
  return sum / total;
}

const roadAt = (z: number) => Math.round(Math.sin(z * .06) * 4);
const lake = (x: number, z: number) => Math.hypot((x - 30) / 12, (z + 34) / 8) < 1;

function heightAt(x: number, z: number, seed: number): number {
  const wild = GROUND - 1 + fbm((x + 400) / 30, (z + 400) / 30, seed) * 10 + Math.max(0, Math.abs(x) - 16) * .1;
  // Flat where the chest stands, rising softly away from it.
  const edge = Math.max(0, Math.max(Math.abs(x) - 12, -z - 30, z - 24)) / 14, weight = Math.min(1, edge * edge);
  return Math.round(GROUND + (wild - GROUND) * weight);
}

function oak(world: BlockWorld, x: number, y: number, z: number, rand: () => number): void {
  const birch = rand() < .3, log = id(birch ? 'birch_log' : 'oak_log'), leaves = id(birch ? 'birch_leaves' : 'oak_leaves');
  const h = 4 + Math.floor(rand() * 3);
  // The game's small oak: two 5×5 layers, then 3×3 caps; the outer corners are random.
  for (let dy = h - 2; dy <= h + 1; dy++) {
    const r = dy >= h ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy === h + 1 || rand() < .5)) continue;
      if (!world.get(x + dx, y + dy, z + dz)) world.set(x + dx, y + dy, z + dz, leaves);
    }
  }
  for (let dy = 0; dy < h; dy++) world.set(x, y + dy, z, log);
}

function build(seed: number): Stage<ChestHandles> {
  let state = seed * 7919 + 13;
  const rand = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const world = new BlockWorld(SX, SY, SZ, [OX, 0, OZ]);
  const heights: number[] = [];
  for (let gz = 0; gz < SZ; gz++) for (let gx = 0; gx < SX; gx++) {
    const x = gx + OX, z = gz + OZ;
    let h = heightAt(x, z, seed);
    if (lake(x, z)) h = GROUND - 3;
    heights[gx + gz * SX] = h;
    for (let y = 0; y <= h; y++) {
      const depth = h - y;
      let block = depth === 0 ? 'grass' : depth < 3 ? 'dirt' : 'stone';
      if (h > 24 && depth === 0) block = 'snow';
      if (Math.hypot((x - 30) / 14, (z + 34) / 10) < 1 && depth === 0) block = 'sand';
      world.set(gx, y, gz, id(block));
    }
    if (lake(x, z)) for (let y = h + 1; y <= GROUND - 1; y++) world.set(gx, y, gz, id('water'));
  }
  const top = (x: number, z: number) => heights[(x - OX) + (z - OZ) * SX] ?? GROUND;
  // The gravel road up to the chest.
  for (let z = -80; z < 30; z++) for (let dx = -1; dx <= 1; dx++) {
    const x = roadAt(z) + dx;
    if (world.inside(x - OX, 0, z - OZ)) world.set(x - OX, top(x, z), z - OZ, id('gravel'));
  }
  // Trees, flowers and grass — off the meadow, the road and the lake.
  for (let i = 0; i < 2400; i++) {
    const x = Math.floor(rand() * SX) + OX, z = Math.floor(rand() * SZ) + OZ, h = top(x, z);
    if (Math.abs(x - roadAt(z)) < 3 || lake(x, z) || world.get(x - OX, h, z - OZ) !== id('grass') || world.get(x - OX, h + 1, z - OZ)) continue;
    // Nothing grows right under the camera: a grass tuft there would fill the screen.
    if (z > 22) continue;
    const meadow = Math.abs(x) < 20 && z > -40;
    const roll = rand();
    if (!meadow && roll < .1) oak(world, x - OX, h + 1, z - OZ, rand);
    else if (roll < .45) world.set(x - OX, h + 1, z - OZ, id('tall_grass'));
    else if (roll < .52) world.set(x - OX, h + 1, z - OZ, id(rand() < .5 ? 'poppy' : 'dandelion'));
    else if (!meadow && roll < .53) world.set(x - OX, h + 1, z - OZ, id('pumpkin'));
  }
  // Torches on short log posts along the road.
  for (const [dx, z] of [[-3, -6], [3, -18], [-3, -30], [3, -44]] as const) {
    const x = roadAt(z) + dx, h = top(x, z);
    world.set(x - OX, h + 1, z - OZ, id('oak_log')); world.set(x - OX, h + 2, z - OZ, id('torch'));
  }
  computeLight(world, BLOCKS);
  const { texture, uv } = blockAtlas();
  const root = new Group();
  root.add(...worldMeshes(meshWorld(world, BLOCKS, { uv, sky: DUSK, minimum: .06 }), texture));
  root.add(farRanges(seed, uv, texture));
  // The square sun of the game, low and warm.
  const sun = new Mesh(new PlaneGeometry(60, 60), new MeshBasicMaterial({ color: raw('#ffe7a6'), fog: false }));
  sun.position.set(-300, 70, -560); sun.lookAt(0, 20, 0);
  root.add(sun);
  return {
    root, living: [clouds(root, rand), storm(root)], calm: .1,
    sky: { top: '#2a3a78', horizon: '#f2a46e', bottom: '#3a3050' },
    fog: { color: '#d99a7e', near: 70, far: 330 },
    camera: { position: [0, GROUND + 7, 38], target: [0, GROUND + 3, -30], fov: 60 },
  };
}

/** The far ranges: a second, coarse block world (4 units a block), lit by the same rules. */
function farRanges(seed: number, uv: (tile: string) => readonly [number, number, number, number], texture: ReturnType<typeof blockAtlas>['texture']): Group {
  const gx = 130, gy = 28, gz = 26, world = new BlockWorld(gx, gy, gz, [-gx / 2, 0, -gz]);
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) {
    const peak = Math.min(gy - 1, Math.round(Math.pow(fbm(x / 10 + 50, z / 8 + 50, seed + 21), 1.5) * gy * 1.35 * Math.min(1, z / 7 + .25)));
    for (let y = 0; y <= peak; y++) world.set(x, y, z, id(y > 13 && peak - y < 2 ? 'snow' : peak - y === 0 ? 'grass' : 'stone'));
  }
  computeLight(world, BLOCKS);
  const group = new Group();
  group.add(...worldMeshes(meshWorld(world, BLOCKS, { uv, sky: DUSK }), texture));
  group.scale.setScalar(4);
  group.position.set(0, GROUND - 24, -200);
  return group;
}

/** The game's clouds: flat white slabs at one height, drifting on. */
function clouds(root: Group, rand: () => number): Living<ChestHandles> {
  const count = 18, mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: raw('#fbe3dc'), transparent: true, opacity: .85 }), count);
  const bank = Array.from({ length: count }, () => ({ x: (rand() - .5) * 400, z: -60 - rand() * 300, w: 16 + Math.floor(rand() * 4) * 8, d: 12 + Math.floor(rand() * 3) * 8 }));
  const dummy = new Object3D();
  root.add(mesh);
  return {
    update(context, dt) {
      bank.forEach((cloud, i) => {
        cloud.x += (1.5 + context.wind * 6) * dt;
        if (cloud.x > 220) cloud.x = -220; if (cloud.x < -220) cloud.x = 220;
        dummy.position.set(cloud.x, 62, cloud.z); dummy.scale.set(cloud.w, 4, cloud.d); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Lightning behind the ranges: the sky lights up and the chest with it; thunder follows. */
function storm(root: Group): Living<ChestHandles> {
  const geometry = new BufferGeometry(), material = new LineBasicMaterial({ color: raw('#f2f5ff'), transparent: true, opacity: 0, fog: false });
  root.add(new Line(geometry, material));
  let next = 22, shown = 0, thunder = -1;
  return {
    update(context, dt) {
      shown = Math.max(0, shown - dt); material.opacity = shown > 0 ? Math.min(1, shown * 6) : 0;
      if (thunder > 0 && (thunder -= dt) <= 0) context.host?.tremor(.35, .9);
      if ((next -= dt) > 0) return;
      next = 30 + context.rand() * 30;
      const points: number[] = []; let x = (context.rand() - .5) * 260, y = 120;
      const z = -300 - context.rand() * 80;
      while (y > 20) { points.push(x, y, z); x += (context.rand() - .5) * 14; y -= 6 + context.rand() * 8; }
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
      shown = .25; context.flash('#d9e2ff', 1); context.host?.light('#dce6ff', .9, .35); thunder = 1 + context.rand() * 1.2;
    },
  };
}

export const OVERWORLD_BLOCKS: StageBuilder<ChestHandles> = { id: 'overworld-blocks', build };
