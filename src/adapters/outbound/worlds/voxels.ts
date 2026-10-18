import { BufferGeometry, Color, Float32BufferAttribute } from 'three';

/**
 * A block world in a box: one byte per block (0 = air). It becomes ONE mesh: only faces that touch
 * air are emitted, each vertex carries its colour with the lighting already baked in (sun by face
 * direction, ambient occlusion from the neighbouring blocks, and glow from lava, torches, crystals).
 * At run time the world needs no lights and no shadows — one draw call, almost no GPU work.
 */
export class VoxelGrid {
  readonly sx: number; readonly sy: number; readonly sz: number;
  private readonly data: Uint8Array;
  constructor(sx: number, sy: number, sz: number) { this.sx = sx; this.sy = sy; this.sz = sz; this.data = new Uint8Array(sx * sy * sz); }
  inside(x: number, y: number, z: number): boolean { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x: number, y: number, z: number): number { return this.inside(x, y, z) ? this.data[x + this.sx * (y + this.sy * z)]! : 0; }
  set(x: number, y: number, z: number, block: number): void { if (this.inside(x, y, z)) this.data[x + this.sx * (y + this.sy * z)] = block; }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, block: number): void {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, block);
  }
}

export interface BlockLook {
  /** Base colour, and an optional different top (grass) and a per-block variation amount. */
  readonly color: string; readonly top?: string; readonly side?: string; readonly vary?: number;
  /** Emissive blocks ignore shading (lava, glowstone, crystals). */
  readonly glow?: boolean;
  /** See-through blocks (leaves look better without AO from themselves, water is drawn elsewhere). */
  readonly soft?: boolean;
}

export interface LightSource { readonly x: number; readonly y: number; readonly z: number; readonly color: string; readonly radius: number; readonly strength: number }

export interface BakeOptions {
  /** Direction the sun light comes FROM (normalised), its colour and the ambient sky light. */
  readonly sun: readonly [number, number, number];
  readonly sunColor: string;
  readonly ambient: string;
  readonly lights?: readonly LightSource[];
  /** World offset of the grid (so lights and the scene share coordinates). */
  readonly offset?: readonly [number, number, number];
}

// Each face: normal, then its 4 corners (CCW seen from outside), as offsets of a unit block.
const FACES: readonly { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];

function hash(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Build the single baked mesh of a grid. `looks[id]` describes block `id`. */
export function bakeGrid(grid: VoxelGrid, looks: Readonly<Record<number, BlockLook>>, options: BakeOptions): BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const [ox, oy, oz] = options.offset ?? [0, 0, 0];
  const sun = options.sun, sunColor = new Color(options.sunColor), ambient = new Color(options.ambient);
  const lights = (options.lights ?? []).map(light => ({ ...light, c: new Color(light.color) }));
  const base = new Color(), lit = new Color(), tint = new Color();
  const solid = (x: number, y: number, z: number) => { const b = grid.get(x, y, z); return b !== 0 && !looks[b]?.soft; };
  for (let z = 0; z < grid.sz; z++) for (let y = 0; y < grid.sy; y++) for (let x = 0; x < grid.sx; x++) {
    const block = grid.get(x, y, z);
    if (!block) continue;
    const look = looks[block];
    if (!look) continue;
    for (const face of FACES) {
      const [nx, ny, nz] = face.n, neighbour = grid.get(x + nx, y + ny, z + nz);
      if (neighbour && !looks[neighbour]?.soft && !(look.soft && neighbour === block)) continue;
      if (look.soft && neighbour === block) continue;
      base.set(ny > 0 && look.top ? look.top : ny === 0 && look.side ? look.side : look.color);
      const vary = (hash(x, y, z) - .5) * (look.vary ?? .08);
      base.offsetHSL(0, 0, vary);
      const start = positions.length / 3;
      for (const [cx, cy, cz] of face.c) {
        const vx = x + cx, vy = y + cy, vz = z + cz;
        positions.push(vx + ox, vy + oy, vz + oz);
        if (look.glow) { colors.push(base.r, base.g, base.b); continue; }
        // Ambient occlusion: the three blocks around this corner, on the air side of the face.
        const ax = cx === 0 ? -1 : 1, ay = cy === 0 ? -1 : 1, az = cz === 0 ? -1 : 1;
        const side1 = nx !== 0 ? solid(x + nx, y + ay, z) : ny !== 0 ? solid(x + ax, y + ny, z) : solid(x + ax, y, z + nz);
        const side2 = nx !== 0 ? solid(x + nx, y, z + az) : ny !== 0 ? solid(x, y + ny, z + az) : solid(x, y + ay, z + nz);
        const corner = nx !== 0 ? solid(x + nx, y + ay, z + az) : ny !== 0 ? solid(x + ax, y + ny, z + az) : solid(x + ax, y + ay, z + nz);
        const occlusion = side1 && side2 ? .45 : 1 - (Number(side1) + Number(side2) + Number(corner)) * .15;
        // Sun by face direction (no shadows: the AO and the fog carry the depth).
        const facing = Math.max(0, nx * sun[0] + ny * sun[1] + nz * sun[2]);
        lit.setRGB(ambient.r + sunColor.r * facing, ambient.g + sunColor.g * facing, ambient.b + sunColor.b * facing);
        for (const light of lights) {
          const dx = light.x - (vx + ox), dy = light.y - (vy + oy), dz = light.z - (vz + oz);
          const d = Math.hypot(dx, dy, dz);
          if (d > light.radius) continue;
          const toward = d > .001 ? Math.max(.25, (dx * nx + dy * ny + dz * nz) / d) : 1;
          const fall = (1 - d / light.radius) ** 2 * light.strength * toward;
          lit.r += light.c.r * fall; lit.g += light.c.g * fall; lit.b += light.c.b * fall;
        }
        tint.copy(base).multiply(lit).multiplyScalar(occlusion);
        colors.push(tint.r, tint.g, tint.b);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Smooth value noise in 2D (for terrain heights), 0..1. */
export function noise2(x: number, z: number, seed: number): number {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (a: number, b: number) => hash(a + seed * 31, 7, b - seed * 17);
  const top = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * s(xf);
  const bottom = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * s(xf);
  return top + (bottom - top) * s(zf);
}

/** Fractal noise: a few octaves of noise2, 0..1. */
export function fbm(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0, amplitude = 1, total = 0, frequency = 1;
  for (let i = 0; i < octaves; i++) { sum += noise2(x * frequency, z * frequency, seed + i * 13) * amplitude; total += amplitude; amplitude *= .5; frequency *= 2; }
  return sum / total;
}

/** Smooth 3D value noise, 0..1 (for caves and floating islands). */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const lo = noise2(x + y * 1.7, z, seed), hi = noise2(x + (y + 1) * 1.7, z, seed);
  const t = y - Math.floor(y), s = t * t * (3 - 2 * t);
  return lo + (hi - lo) * s;
}
