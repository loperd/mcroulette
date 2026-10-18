import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, InstancedMesh, Line, LineBasicMaterial, Mesh,
  MeshBasicMaterial, Object3D, PlaneGeometry, Points, PointsMaterial, Vector3,
} from 'three';
import { bakeGrid, fbm, VoxelGrid, type BlockLook, type LightSource } from './voxels.ts';
import type { BuiltWorld, Living, VoxelWorldScene } from './voxel-world.ts';

/**
 * The Overworld at dusk ("Дороги Верхнего мира"): a meadow with a dirt road running up to the
 * chest, oak and birch hills on both sides, a lake, and snow-capped ranges under a sunset. Living:
 * slab clouds drift, the lake shimmers, fireflies wake over the grass, leaves ride the wind, birds
 * cross the sky, and a storm rumbles behind the mountains — its lightning and thunder reach the chest.
 */
const B = { Grass: 1, Dirt: 2, Stone: 3, Snow: 4, Oak: 5, OakLeaves: 6, Birch: 7, BirchLeaves: 8, Sand: 9, Path: 10, Gravel: 11, Lantern: 12, Flower: 13, Pumpkin: 14 } as const;

const LOOKS: Record<number, BlockLook> = {
  [B.Grass]: { color: '#6b4a32', top: '#5c9a3e', side: '#5f7a3b', vary: .12 },
  [B.Dirt]: { color: '#6b4a32', vary: .1 },
  [B.Stone]: { color: '#7d7d84', vary: .14 },
  [B.Snow]: { color: '#eef2ff', vary: .05 },
  [B.Oak]: { color: '#5d4127', top: '#9a7a4e', vary: .06 },
  [B.OakLeaves]: { color: '#3c7a31', vary: .2, soft: true },
  [B.Birch]: { color: '#d8d4c6', top: '#c9b98f', vary: .05 },
  [B.BirchLeaves]: { color: '#6f9c3e', vary: .18, soft: true },
  [B.Sand]: { color: '#d8c98e', vary: .06 },
  [B.Path]: { color: '#6b4a32', top: '#9a7b4f', side: '#7a5c3c', vary: .08 },
  [B.Gravel]: { color: '#8a8580', vary: .2 },
  [B.Lantern]: { color: '#ffcf6b', glow: true },
  [B.Flower]: { color: '#d63d3d', glow: false, vary: .1, soft: true },
  [B.Pumpkin]: { color: '#d97a1e', top: '#6f8a2e', vary: .05 },
};

const SX = 128, SY = 48, SZ = 168, OX = -64, OZ = -112, GROUND = 12;
/** Trees keep off a wide valley in front of the camera, so the view opens onto the ranges. */
const valley = (x: number, z: number) => Math.abs(x) < 22 + Math.max(0, -z - 30) * .15 && z > -70;
const roadAt = (z: number) => Math.sin(z * .06) * 4;

function terrainHeight(x: number, z: number, seed: number): number {
  const rolling = fbm((x + 400) / 38, (z + 400) / 38, seed) * 9;
  const far = Math.max(0, -z - 50) / 60;
  const ridges = Math.pow(fbm((x + 900) / 26, (z + 900) / 26, seed + 5), 1.6) * 34 * Math.min(1, far * 1.4);
  const wild = GROUND - 2 + rolling + ridges + Math.max(0, Math.abs(x) - 18) * .1 * Math.max(0, 1 - far);
  // The meadow blends into the hills: flat where the chest stands, rising softly away from it.
  const edge = Math.max(0, Math.max(Math.abs(x) - 12, -z - 30, z - 30)) / 14;
  const weight = Math.min(1, edge * edge);
  const flat = GROUND + (fbm(x / 10, z / 10, seed + 9) - .5) * 1.2;
  return Math.round(flat + (wild - flat) * weight);
}

function lake(x: number, z: number): boolean { return Math.hypot((x - 34) / 14, (z + 30) / 9) < 1; }

function tree(grid: VoxelGrid, x: number, y: number, z: number, rand: () => number): void {
  const birch = rand() < .3, h = 4 + Math.floor(rand() * 3), log = birch ? B.Birch : B.Oak, leaves = birch ? B.BirchLeaves : B.OakLeaves;
  for (let i = 0; i < h; i++) grid.set(x, y + i, z, log);
  const top = y + h;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) {
    const edge = Math.abs(dx) === 2 && Math.abs(dz) === 2;
    if (edge && (dy > -1 || rand() < .5)) continue;
    if (dy === 1 && (Math.abs(dx) > 1 || Math.abs(dz) > 1)) continue;
    if (grid.get(x + dx, top + dy, z + dz) === 0) grid.set(x + dx, top + dy, z + dz, leaves);
  }
}

function glowTexture(color: string): CanvasTexture {
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = canvas.getContext('2d')!, gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color); gradient.addColorStop(.35, color + '88'); gradient.addColorStop(1, color + '00');
  g.fillStyle = gradient; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** A soft round glow billboard (sun halo, lantern light). */
export function glowSprite(color: string, size: number, opacity: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size, size), new MeshBasicMaterial({ map: glowTexture(color), transparent: true, opacity, depthWrite: false, blending: AdditiveBlending, fog: false }));
  mesh.userData.billboard = true;
  return mesh;
}

function build(seed: number): BuiltWorld {
  let state = seed * 7919 + 13;
  const rand = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const grid = new VoxelGrid(SX, SY, SZ);
  const heights: number[][] = [];
  for (let gx = 0; gx < SX; gx++) {
    heights[gx] = [];
    for (let gz = 0; gz < SZ; gz++) {
      const x = gx + OX, z = gz + OZ;
      let h = terrainHeight(x, z, seed);
      if (lake(x, z)) h = Math.min(h, GROUND - 3);
      heights[gx]![gz] = h;
      for (let y = 0; y <= h; y++) {
        const depth = h - y;
        let block: number = depth === 0 ? B.Grass : depth < 3 ? B.Dirt : B.Stone;
        if (h > 34 && depth < 2) block = B.Snow;
        else if (h > 28 && depth === 0) block = B.Stone;
        if (lake(x, z) && depth === 0) block = B.Sand;
        if (Math.hypot((x - 34) / 16, (z + 30) / 11) < 1 && !lake(x, z) && depth === 0) block = B.Sand;
        grid.set(gx, y, gz, block);
      }
    }
  }
  // The road from the far hills to the chest.
  for (let z = -70; z < 12; z++) {
    const cx = Math.round(roadAt(z)), half = z > -20 ? 2 : 1;
    for (let dx = -half; dx <= half; dx++) {
      const gx = cx + dx - OX, gz = z - OZ, h = heights[gx]?.[gz];
      if (h !== undefined) grid.set(gx, h, gz, rand() < .12 ? B.Gravel : B.Path);
    }
  }
  // Trees, flowers and pumpkins — never on the meadow, the road or the lake.
  const lights: LightSource[] = [];
  for (let i = 0; i < 520; i++) {
    const x = Math.floor(rand() * SX) + OX, z = Math.floor(rand() * (SZ - 10)) + OZ;
    if (valley(x, z) || lake(x, z) || Math.abs(x - roadAt(z)) < 4) continue;
    const gx = x - OX, gz = z - OZ, h = heights[gx]![gz]!;
    if (h > 26 || grid.get(gx, h, gz) !== B.Grass) continue;
    if (rand() < .78) tree(grid, gx, h + 1, gz, rand);
    else if (rand() < .7) grid.set(gx, h + 1, gz, B.Flower);
    else grid.set(gx, h + 1, gz, B.Pumpkin);
  }
  // Lantern posts along the road near the chest.
  for (const [x, z] of [[-6, -8], [6, -20], [-5, -32]] as const) {
    const gx = Math.round(roadAt(z)) + x - OX, gz = z - OZ, h = heights[gx]![gz]!;
    for (let y = 1; y <= 3; y++) grid.set(gx, h + y, gz, B.Oak);
    grid.set(gx, h + 4, gz, B.Lantern);
    lights.push({ x: gx + OX + .5, y: h + 4.5, z: gz + OZ + .5, color: '#ffb35c', radius: 9, strength: 1.4 });
  }
  const sunDir = new Vector3(-.55, .32, -.77).normalize();
  const terrain = new Mesh(bakeGrid(grid, LOOKS, {
    sun: [sunDir.x, sunDir.y, sunDir.z], sunColor: '#ffb27a', ambient: '#4b4f86', lights, offset: [OX, 0, OZ],
  }), new MeshBasicMaterial({ vertexColors: true }));
  const root = new Group();
  root.add(terrain, farRanges(seed, sunDir));

  // The sun low over the ranges, with its halo.
  const sunAt = sunDir.clone().multiplyScalar(600).add(new Vector3(0, -40, 0));
  const sun = new Mesh(new PlaneGeometry(34, 34), new MeshBasicMaterial({ color: '#ffe2a0', fog: false }));
  sun.position.copy(sunAt); sun.lookAt(0, GROUND, 0);
  const halo = glowSprite('#ffb06a', 260, .75); halo.position.copy(sunAt).multiplyScalar(.98); halo.lookAt(0, GROUND, 0);
  root.add(halo, sun);

  // Lantern halos.
  for (const light of lights) { const glow = glowSprite('#ffb35c', 5, .7); glow.position.set(light.x, light.y, light.z); root.add(glow); }

  const living: Living[] = [];
  living.push(lakeSurface(root), clouds(root, rand), fireflies(root, rand), leaves(root), birds(root, rand), storm(root));
  return {
    root, living, calm: .12,
    sky: { top: '#141936', horizon: '#f0a26c', bottom: '#2b2140' },
    fog: { color: '#a77c86', near: 80, far: 420 },
    camera: { position: [0, GROUND + 11, 34], target: [0, GROUND + 5, -40], fov: 46 },
  };
}

/** The distant ranges: coarse blocks (5 units each), snow on the tops, lost in the haze. */
function farRanges(seed: number, sunDir: Vector3): Mesh {
  const size = 4, gx = 150, gy = 26, gz = 30, grid = new VoxelGrid(gx, gy, gz);
  for (let x = 0; x < gx; x++) for (let z = 0; z < gz; z++) {
    const peak = Math.pow(fbm(x / 11 + 50, z / 8 + 50, seed + 21), 1.6) * gy * 1.25 * Math.min(1, z / 8 + .25);
    const h = Math.min(gy - 1, Math.round(peak));
    for (let y = 0; y <= h; y++) grid.set(x, y, z, y > 12 && h - y < 2 ? 2 : 1);
  }
  const mesh = new Mesh(bakeGrid(grid, { 1: { color: '#6f6a86', vary: .12 }, 2: { color: '#f3eef8', vary: .05 } },
    { sun: [sunDir.x, sunDir.y, sunDir.z], sunColor: '#ffae7a', ambient: '#5a5a92', offset: [-gx / 2, 0, -gz] }), new MeshBasicMaterial({ vertexColors: true }));
  mesh.scale.setScalar(size);
  mesh.position.set(0, GROUND - 26, -230);
  return mesh;
}

function lakeSurface(root: Group): Living {
  const geometry = new PlaneGeometry(30, 20); geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({ color: '#4a6aa0', transparent: true, opacity: .82 });
  const water = new Mesh(geometry, material); water.position.set(34, GROUND - 2.15, -30);
  root.add(water);
  const base = new Color('#4a6aa0'), sunset = new Color('#c98a8a');
  return { update(world) { material.color.copy(base).lerp(sunset, .25 + Math.sin(world.time * .8) * .08); } };
}

function clouds(root: Group, rand: () => number): Living {
  const count = 16, mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#f3c8cf', transparent: true, opacity: .9 }), count * 3);
  const bank: { x: number; y: number; z: number; w: number; d: number; speed: number }[] = [];
  for (let i = 0; i < count; i++) bank.push({ x: (rand() - .5) * 360, y: 58 + rand() * 18, z: -40 - rand() * 220, w: 18 + rand() * 30, d: 10 + rand() * 18, speed: 1 + rand() * 1.5 });
  const dummy = new Object3D();
  root.add(mesh);
  return {
    update(world, dt) {
      bank.forEach((cloud, i) => {
        cloud.x += (cloud.speed + world.wind * 8) * dt;
        if (cloud.x > 200) cloud.x = -200; if (cloud.x < -200) cloud.x = 200;
        // A Minecraft cloud: a flat slab with a smaller one on top and one beside.
        const parts: [number, number, number, number, number, number][] = [[0, 0, 0, cloud.w, 4, cloud.d], [cloud.w * .15, 3.5, cloud.d * .1, cloud.w * .5, 3, cloud.d * .6], [-cloud.w * .4, -.5, cloud.d * .3, cloud.w * .35, 3, cloud.d * .5]];
        parts.forEach(([dx, dy, dz, w, h, d], k) => { dummy.position.set(cloud.x + dx, cloud.y + dy, cloud.z + dz); dummy.scale.set(w, h, d); dummy.updateMatrix(); mesh.setMatrixAt(i * 3 + k, dummy.matrix); });
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function particles(count: number, size: number, color: string): { points: Points; positions: Float32Array; colors: Float32Array } {
  const geometry = new BufferGeometry(), positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('color', new BufferAttribute(colors, 3));
  const points = new Points(geometry, new PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, color }));
  return { points, positions, colors };
}

function fireflies(root: Group, rand: () => number): Living {
  const n = 70, { points, positions, colors } = particles(n, .35, '#ffffff');
  const flies = Array.from({ length: n }, () => ({ x: (rand() - .5) * 60, y: GROUND + 1 + rand() * 4, z: -40 + rand() * 45, vx: 0, vz: 0, phase: rand() * 10 }));
  root.add(points);
  const glow = new Color('#d6ff7a');
  return {
    update(world, dt) {
      flies.forEach((f, i) => {
        f.phase += dt; f.vx += (world.rand() - .5) * 2 * dt + world.wind * dt; f.vz += (world.rand() - .5) * 2 * dt;
        f.vx *= .98; f.vz *= .98; f.x += f.vx * dt; f.z += f.vz * dt; f.y += Math.sin(f.phase * 1.3) * .2 * dt;
        const on = Math.max(0, Math.sin(f.phase * 1.7)) ** 2;
        positions.set([f.x, f.y, f.z], i * 3); colors.set([glow.r * on, glow.g * on, glow.b * on], i * 3);
      });
      points.geometry.attributes.position!.needsUpdate = true; points.geometry.attributes.color!.needsUpdate = true;
    },
  };
}

function leaves(root: Group): Living {
  const n = 90, { points, positions, colors } = particles(n, .28, '#ffffff');
  points.material = new PointsMaterial({ size: .28, vertexColors: true });
  const tones = ['#d9822b', '#b5562a', '#e3b13a', '#6b9a3a'].map(c => new Color(c));
  const all = Array.from({ length: n }, (_, i) => ({ x: 0, y: -100, z: 0, vy: 0, spin: i, live: false }));
  let nextGust = 8;
  root.add(points);
  return {
    update(world, dt) {
      if ((nextGust -= dt) <= 0) {
        nextGust = 12 + world.rand() * 14;
        const side = world.rand() < .5 ? -1 : 1;
        world.gust(.45 + world.rand() * .45, side);
        for (const leaf of all) if (!leaf.live && world.rand() < .6) Object.assign(leaf, { x: -side * (25 + world.rand() * 20), y: GROUND + 3 + world.rand() * 10, z: -30 + world.rand() * 35, vy: -(.5 + world.rand()), live: true });
      }
      all.forEach((leaf, i) => {
        if (leaf.live) { leaf.x += world.wind * 14 * dt + Math.sin(leaf.spin) * .6 * dt; leaf.y += leaf.vy * dt; leaf.spin += dt * 3; if (leaf.y < GROUND) leaf.live = false; }
        positions.set([leaf.x, leaf.live ? leaf.y : -100, leaf.z], i * 3);
        const c = tones[i % tones.length]!; colors.set([c.r, c.g, c.b], i * 3);
      });
      points.geometry.attributes.position!.needsUpdate = true; points.geometry.attributes.color!.needsUpdate = true;
    },
  };
}

function birds(root: Group, rand: () => number): Living {
  const n = 7, { points, positions, colors } = particles(n * 3, .9, '#ffffff');
  points.material = new PointsMaterial({ size: .9, vertexColors: true });
  let x = -200, wait = 5, flap = 0;
  const offsets = Array.from({ length: n }, (_, i) => ({ dx: -i * 4 - rand() * 2, dy: (i % 2) * 2 + rand(), dz: rand() * 6 }));
  root.add(points);
  return {
    update(world, dt) {
      if (x > 220) { wait -= dt; if (wait <= 0) { x = -200; wait = 18 + world.rand() * 20; } }
      else x += 14 * dt;
      flap += dt * 10;
      offsets.forEach((o, i) => {
        const bx = x + o.dx, by = 52 + o.dy, bz = -120 + o.dz, up = Math.sin(flap + i) * .8;
        positions.set([bx, by, bz, bx - 1, by + up, bz, bx + 1, by + up, bz], i * 9);
        colors.set([.1, .08, .14, .1, .08, .14, .1, .08, .14], i * 9);
      });
      points.geometry.attributes.position!.needsUpdate = true; points.geometry.attributes.color!.needsUpdate = true;
    },
  };
}

/** Lightning behind the ranges: the sky lights up and the chest with it; thunder follows and shakes it. */
function storm(root: Group): Living {
  const geometry = new BufferGeometry(), material = new LineBasicMaterial({ color: '#f2f5ff', transparent: true, opacity: 0, fog: false });
  const bolt = new Line(geometry, material);
  root.add(bolt);
  let next = 22, shown = 0, thunder = -1;
  return {
    update(world, dt) {
      shown = Math.max(0, shown - dt); material.opacity = shown > 0 ? Math.min(1, shown * 6) : 0;
      if (thunder > 0 && (thunder -= dt) <= 0) world.chest.tremor(.35, .9);
      if ((next -= dt) > 0) return;
      next = 30 + world.rand() * 30;
      const points: number[] = []; let x = (world.rand() - .5) * 260, y = 120;
      const z = -260 - world.rand() * 80;
      while (y > 30) { points.push(x, y, z); x += (world.rand() - .5) * 14; y -= 6 + world.rand() * 8; }
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
      shown = .25; world.flash('#d9e2ff', 1); world.chest.light('#dce6ff', .9, .35); thunder = 1 + world.rand() * 1.2;
    },
  };
}

export const OVERWORLD_3D: VoxelWorldScene = { id: 'overworld-3d', build };
