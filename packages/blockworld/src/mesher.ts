import type { Block, BlockRegistry } from './blocks.ts';
import type { BlockWorld } from './world.ts';

/**
 * Turns a lit BlockWorld into mesh data the way the game draws it (vanilla look):
 * - a cube shows only faces not covered by an opaque neighbour;
 * - directional face shade: top 1.0, north/south 0.8, east/west 0.6, bottom 0.5;
 * - smooth lighting: each vertex averages the light of the four cells on the open side of its face,
 *   brightness from the game's curve `f / (4 − 3f)` with the default gamma;
 * - ambient occlusion from the two side cells and the corner cell of each vertex (as
 *   prismarine-viewer's mesher), with the quad's diagonal flipped to follow it;
 * - crosses (flowers, grass) are two diagonal planes, torches a thin stick, liquids a surface at
 *   14/16 of the cell drawn in a separate transparent pass.
 * Output is plain typed arrays (no three.js), so meshing can be tested, cached or moved to a worker.
 */
export interface MeshArrays {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  /** Per vertex: how free it is to move in the wind (plant tops, leaves) or wave (water tops), 0..1. */
  readonly sway: Float32Array;
  /** Per vertex: the share of its light that comes from glowing blocks (torches flicker it), 0..1. */
  readonly glow: Float32Array;
}

export interface WorldMesh {
  /** Cubes, including cut-out ones (leaves): drawn opaque with alpha test. */
  readonly opaque: MeshArrays;
  /** Crosses and torches: drawn from both sides with alpha test. */
  readonly plants: MeshArrays;
  /** Liquid surfaces: blended. */
  readonly liquid: MeshArrays;
}

export interface MeshOptions {
  /** [u0, v0, u1, v1] of an atlas tile. */
  readonly uv: (tile: string) => readonly [number, number, number, number];
  /** Tint of full sky light (dusk, the End's violet); default white. As [r, g, b] 0..1. */
  readonly sky?: readonly [number, number, number];
  /** Tint of block light (torches, lava); default warm. */
  readonly glow?: readonly [number, number, number];
  /** The darkest a lightless face gets, 0..1 (caves are dark, not black). */
  readonly minimum?: number;
  /** Strength of ambient occlusion, 0 none .. 1 full (vanilla-like ≈ .6). */
  readonly occlusion?: number;
  /**
   * The sun, the way shader packs light the world — but baked, since the sun never moves: faces
   * turned to it warm up, and every vertex casts a ray towards it through the grid; if a block or a
   * leaf is in the way it lies in shadow. Only where sky light reaches (no sun in caves).
   */
  readonly sun?: {
    /** Direction TOWARDS the sun. */
    readonly direction: readonly [number, number, number];
    readonly color: readonly [number, number, number];
    /** How much of the light is sun (vs. sky): 0 vanilla .. ~.45 strong dusk shadows. */
    readonly strength: number;
    /** How far a shadow reaches, in blocks. */
    readonly reach?: number;
  };
}

/** The game's light curve for a level 0..15, with the default (moody → bright midpoint) gamma. */
export function brightness(level: number): number {
  const f = Math.max(0, Math.min(15, level)) / 15, curve = f / (4 - 3 * f);
  const lifted = 1 - Math.pow(1 - curve, 4);
  return curve + (lifted - curve) * .5;
}

interface Face { readonly n: readonly [number, number, number]; readonly shade: number; readonly corners: readonly (readonly [number, number, number])[]; readonly kind: 'top' | 'bottom' | 'side' }

// Corners counter-clockwise seen from outside: bottom-left, bottom-right, top-right, top-left of
// the texture as it appears on that face.
export const FACES: readonly Face[] = [
  { n: [1, 0, 0], shade: .6, kind: 'side', corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], shade: .6, kind: 'side', corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 0, 1], shade: .8, kind: 'side', corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], shade: .8, kind: 'side', corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { n: [0, 1, 0], shade: 1, kind: 'top', corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], shade: .5, kind: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
];

const AO_LEVELS = [.5, .65, .82, 1];
/** A torch's own vertices: the stick stays, the flame end flickers. */
const FLAME = [0, 0, 1, 1];

class Builder {
  positions: number[] = []; uvs: number[] = []; colors: number[] = []; indices: number[] = []; sway: number[] = []; glow: number[] = [];
  quad(points: readonly (readonly [number, number, number])[], uv: readonly [number, number, number, number], colors: readonly (readonly [number, number, number])[], flip = false, sub?: readonly [number, number, number, number], sway: readonly number[] = [0, 0, 0, 0], glow: readonly number[] = [0, 0, 0, 0]): void {
    const start = this.positions.length / 3;
    const [u0, v0, u1, v1] = uv, du = u1 - u0, dv = v1 - v0;
    // Optional sub-rectangle of the tile (fractions), for small models like the torch.
    const [a0, b0, a1, b1] = sub ?? [0, 0, 1, 1];
    const corners: [number, number][] = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
    points.forEach((p, i) => {
      this.positions.push(p[0], p[1], p[2]);
      this.uvs.push(u0 + du * corners[i]![0], v0 + dv * corners[i]![1]);
      this.colors.push(colors[i]![0], colors[i]![1], colors[i]![2]);
      this.sway.push(sway[i]!); this.glow.push(glow[i]!);
    });
    if (flip) this.indices.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
    else this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  arrays(): MeshArrays {
    return { positions: new Float32Array(this.positions), uvs: new Float32Array(this.uvs), colors: new Float32Array(this.colors), indices: new Uint32Array(this.indices), sway: new Float32Array(this.sway), glow: new Float32Array(this.glow) };
  }
}

function normalise(v: readonly [number, number, number]): readonly [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function meshWorld(world: BlockWorld, registry: BlockRegistry, options: MeshOptions): WorldMesh {
  const opaque = new Builder(), plants = new Builder(), liquid = new Builder();
  const sky = options.sky ?? [1, 1, 1], glow = options.glow ?? [1, .87, .66];
  const minimum = options.minimum ?? .045, occlusion = options.occlusion ?? .6;
  const [ox, oy, oz] = world.origin;
  const blockAt = (x: number, y: number, z: number): Block | undefined => registry.get(world.get(x, y, z));
  const sun = options.sun, sunDir = sun ? normalise(sun.direction) : [0, 1, 0] as const;
  /** Is a point (grid coordinates) lit by the sun: nothing solid or leafy between it and the sky? */
  const sunlit = (px: number, py: number, pz: number): boolean => {
    const reach = sun?.reach ?? 64;
    for (let d = .6; d < reach; d += .5) {
      const cx = Math.floor(px + sunDir[0] * d), cy = Math.floor(py + sunDir[1] * d), cz = Math.floor(pz + sunDir[2] * d);
      if (cy >= world.sy) return true;
      const hit = blockAt(cx, cy, cz);
      if (hit && (hit.opaque || hit.model === 'cube')) return false;
    }
    return true;
  };
  /** Sun on top of the vanilla light: shadowed where blocked, warm where facing it; scaled by sky. */
  const withSun = (color: [number, number, number], skyLevel: number, facing: number, px: number, py: number, pz: number): [number, number, number] => {
    if (!sun || skyLevel <= 0) return color;
    const sky = brightness(skyLevel), k = sun.strength * sky;
    const amount = facing > 0 && sunlit(px, py, pz) ? facing : 0;
    return [0, 1, 2].map(i => Math.min(1.25, color[i]! * (1 - k + sun.color[i]! * k * 2.6 * amount))) as [number, number, number];
  };
  const solid = (x: number, y: number, z: number) => blockAt(x, y, z)?.opaque ? 1 : 0;
  const light = (s: number, g: number): [number, number, number] => {
    const bs = brightness(s), bg = brightness(g);
    return [Math.min(1, Math.max(minimum, sky[0] * bs + glow[0] * bg)), Math.min(1, Math.max(minimum, sky[1] * bs + glow[1] * bg)), Math.min(1, Math.max(minimum, sky[2] * bs + glow[2] * bg))];
  };

  /** How much of a light mix is block light, so the shader can flicker just that part. */
  const glowShare = (s: number, g: number): number => {
    const bg = brightness(g), bs = brightness(s) * (sky[0] + sky[1] + sky[2]) / 3;
    return bg <= 0 ? 0 : bg / (bg + bs);
  };

  for (let z = 0; z < world.sz; z++) for (let y = 0; y < world.sy; y++) for (let x = 0; x < world.sx; x++) {
    const block = blockAt(x, y, z);
    if (!block) continue;
    const at = (px: number, py: number, pz: number): [number, number, number] => [x + px + ox, y + py + oy, z + pz + oz];

    if (block.model === 'cross') {
      const c = withSun(light(world.skyAt(x, y, z), world.glowAt(x, y, z)), world.skyAt(x, y, z), Math.max(.55, sunDir[1]), x + .5, y + .6, z + .5), cs = [c, c, c, c];
      const uv = options.uv(block.textures.side);
      // Rooted at the bottom, free at the top.
      const free = [0, 0, 1, 1], g = glowShare(world.skyAt(x, y, z), world.glowAt(x, y, z)), gs = [g, g, g, g];
      plants.quad([at(.15, 0, .15), at(.85, 0, .85), at(.85, 1, .85), at(.15, 1, .15)], uv, cs, false, undefined, free, gs);
      plants.quad([at(.15, 0, .85), at(.85, 0, .15), at(.85, 1, .15), at(.15, 1, .85)], uv, cs, false, undefined, free, gs);
      continue;
    }
    if (block.model === 'torch') {
      const lit: [number, number, number] = [1, 1, 1], ls = [lit, lit, lit, lit], uv = options.uv(block.textures.side);
      const a = 7 / 16, b = 9 / 16, h = 12 / 16;
      // Sides show the stick and its flame (tile columns 7–8, rows 4–15); the top shows the flame.
      const side: [number, number, number, number] = [7 / 16, 0, 9 / 16, h];
      plants.quad([at(b, 0, b), at(b, 0, a), at(b, h, a), at(b, h, b)], uv, ls, false, side, undefined, FLAME);
      plants.quad([at(a, 0, a), at(a, 0, b), at(a, h, b), at(a, h, a)], uv, ls, false, side, undefined, FLAME);
      plants.quad([at(a, 0, b), at(b, 0, b), at(b, h, b), at(a, h, b)], uv, ls, false, side, undefined, FLAME);
      plants.quad([at(b, 0, a), at(a, 0, a), at(a, h, a), at(b, h, a)], uv, ls, false, side, undefined, FLAME);
      plants.quad([at(a, h, b), at(b, h, b), at(b, h, a), at(a, h, a)], uv, ls, false, [7 / 16, 10 / 16, 9 / 16, 12 / 16], undefined, [1, 1, 1, 1]);
      continue;
    }

    for (const face of FACES) {
      const [nx, ny, nz] = face.n, neighbour = blockAt(x + nx, y + ny, z + nz);
      if (block.model === 'liquid') {
        if (neighbour?.id === block.id || neighbour?.opaque) continue;
      } else {
        if (neighbour?.opaque) continue;
        if (neighbour && neighbour.id === block.id && block.transparent) continue;
      }
      const tile = face.kind === 'top' ? block.textures.top : face.kind === 'bottom' ? block.textures.bottom : block.textures.side;
      const uv = options.uv(tile);
      // The open side of the face, and the two axes along it.
      const ax = x + nx, ay = y + ny, az = z + nz;
      const tangents = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const).filter(t => t[0] * nx + t[1] * ny + t[2] * nz === 0);
      const colors: [number, number, number][] = [], aos: number[] = [], sway: number[] = [], glows: number[] = [];
      const points = face.corners.map(([cx, cy, cz]) => {
        const corner = [cx, cy, cz] as const;
        const steps = tangents.map(t => (corner[t.indexOf(1)]! === 0 ? -1 : 1));
        const [t1, t2] = tangents as unknown as [readonly [number, number, number], readonly [number, number, number]];
        const s1 = [ax + t1[0] * steps[0]!, ay + t1[1] * steps[0]!, az + t1[2] * steps[0]!] as const;
        const s2 = [ax + t2[0] * steps[1]!, ay + t2[1] * steps[1]!, az + t2[2] * steps[1]!] as const;
        const cc = [s1[0] + t2[0] * steps[1]!, s1[1] + t2[1] * steps[1]!, s1[2] + t2[2] * steps[1]!] as const;
        const o1 = solid(...s1), o2 = solid(...s2), o3 = o1 && o2 ? 1 : solid(...cc);
        const ao = o1 && o2 ? 0 : 3 - (o1 + o2 + o3);
        aos.push(ao);
        // Smooth light: average the open cells around the vertex (blocked ones don't count).
        let skySum = world.skyAt(ax, ay, az), glowSum = world.glowAt(ax, ay, az), count = 1;
        for (const [cell, blocked] of [[s1, o1], [s2, o2], [cc, o3]] as const) {
          if (blocked) continue;
          skySum += world.skyAt(...cell); glowSum += world.glowAt(...cell); count++;
        }
        const lit = block.light > 0 ? [1, 1, 1] as const : light(skySum / count, glowSum / count);
        const occluded = 1 - (1 - AO_LEVELS[ao]!) * occlusion;
        const shade = block.light > 0 ? 1 : face.shade * occluded;
        let vertex: [number, number, number] = [lit[0] * shade, lit[1] * shade, lit[2] * shade];
        if (block.light === 0) {
          const facing = nx * sunDir[0] + ny * sunDir[1] + nz * sunDir[2];
          vertex = withSun(vertex, skySum / count, facing, x + cx + nx * .02, y + cy + ny * .02, z + cz + nz * .02);
        }
        colors.push(vertex);
        glows.push(block.light > 0 ? 1 : glowShare(skySum / count, glowSum / count));
        const surface = block.model === 'liquid' && cy === 1 && blockAt(x, y + 1, z)?.id !== block.id;
        const top = surface ? 14 / 16 : cy;
        // Leaves rustle a little as a whole; a liquid's surface waves.
        sway.push(block.cutout && block.model === 'cube' ? .3 : surface ? 1 : 0);
        return at(cx, top, cz);
      });
      const target = block.model === 'liquid' ? liquid : opaque;
      // Split the quad along the brighter diagonal, so occlusion does not streak.
      target.quad(points, uv, colors, aos[0]! + aos[2]! < aos[1]! + aos[3]!, undefined, sway, glows);
    }
  }
  return { opaque: opaque.arrays(), plants: plants.arrays(), liquid: liquid.arrays() };
}
