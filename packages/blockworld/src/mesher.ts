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

class Builder {
  positions: number[] = []; uvs: number[] = []; colors: number[] = []; indices: number[] = [];
  quad(points: readonly (readonly [number, number, number])[], uv: readonly [number, number, number, number], colors: readonly (readonly [number, number, number])[], flip = false, sub?: readonly [number, number, number, number]): void {
    const start = this.positions.length / 3;
    const [u0, v0, u1, v1] = uv, du = u1 - u0, dv = v1 - v0;
    // Optional sub-rectangle of the tile (fractions), for small models like the torch.
    const [a0, b0, a1, b1] = sub ?? [0, 0, 1, 1];
    const corners: [number, number][] = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
    points.forEach((p, i) => {
      this.positions.push(p[0], p[1], p[2]);
      this.uvs.push(u0 + du * corners[i]![0], v0 + dv * corners[i]![1]);
      this.colors.push(colors[i]![0], colors[i]![1], colors[i]![2]);
    });
    if (flip) this.indices.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
    else this.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  arrays(): MeshArrays {
    return { positions: new Float32Array(this.positions), uvs: new Float32Array(this.uvs), colors: new Float32Array(this.colors), indices: new Uint32Array(this.indices) };
  }
}

export function meshWorld(world: BlockWorld, registry: BlockRegistry, options: MeshOptions): WorldMesh {
  const opaque = new Builder(), plants = new Builder(), liquid = new Builder();
  const sky = options.sky ?? [1, 1, 1], glow = options.glow ?? [1, .87, .66];
  const minimum = options.minimum ?? .045, occlusion = options.occlusion ?? .6;
  const [ox, oy, oz] = world.origin;
  const blockAt = (x: number, y: number, z: number): Block | undefined => registry.get(world.get(x, y, z));
  const solid = (x: number, y: number, z: number) => blockAt(x, y, z)?.opaque ? 1 : 0;
  const light = (s: number, g: number): [number, number, number] => {
    const bs = brightness(s), bg = brightness(g);
    return [Math.min(1, Math.max(minimum, sky[0] * bs + glow[0] * bg)), Math.min(1, Math.max(minimum, sky[1] * bs + glow[1] * bg)), Math.min(1, Math.max(minimum, sky[2] * bs + glow[2] * bg))];
  };

  for (let z = 0; z < world.sz; z++) for (let y = 0; y < world.sy; y++) for (let x = 0; x < world.sx; x++) {
    const block = blockAt(x, y, z);
    if (!block) continue;
    const at = (px: number, py: number, pz: number): [number, number, number] => [x + px + ox, y + py + oy, z + pz + oz];

    if (block.model === 'cross') {
      const c = light(world.skyAt(x, y, z), world.glowAt(x, y, z)), cs = [c, c, c, c];
      const uv = options.uv(block.textures.side);
      plants.quad([at(.15, 0, .15), at(.85, 0, .85), at(.85, 1, .85), at(.15, 1, .15)], uv, cs);
      plants.quad([at(.15, 0, .85), at(.85, 0, .15), at(.85, 1, .15), at(.15, 1, .85)], uv, cs);
      continue;
    }
    if (block.model === 'torch') {
      const lit: [number, number, number] = [1, 1, 1], ls = [lit, lit, lit, lit], uv = options.uv(block.textures.side);
      const a = 7 / 16, b = 9 / 16, h = 12 / 16;
      // Sides show the stick and its flame (tile columns 7–8, rows 4–15); the top shows the flame.
      const side: [number, number, number, number] = [7 / 16, 0, 9 / 16, h];
      plants.quad([at(b, 0, b), at(b, 0, a), at(b, h, a), at(b, h, b)], uv, ls, false, side);
      plants.quad([at(a, 0, a), at(a, 0, b), at(a, h, b), at(a, h, a)], uv, ls, false, side);
      plants.quad([at(a, 0, b), at(b, 0, b), at(b, h, b), at(a, h, b)], uv, ls, false, side);
      plants.quad([at(b, 0, a), at(a, 0, a), at(a, h, a), at(b, h, a)], uv, ls, false, side);
      plants.quad([at(a, h, b), at(b, h, b), at(b, h, a), at(a, h, a)], uv, ls, false, [7 / 16, 10 / 16, 9 / 16, 12 / 16]);
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
      const colors: [number, number, number][] = [], aos: number[] = [];
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
        colors.push([lit[0] * shade, lit[1] * shade, lit[2] * shade]);
        const top = block.model === 'liquid' && cy === 1 && blockAt(x, y + 1, z)?.id !== block.id ? 14 / 16 : cy;
        return at(cx, top, cz);
      });
      const target = block.model === 'liquid' ? liquid : opaque;
      // Split the quad along the brighter diagonal, so occlusion does not streak.
      target.quad(points, uv, colors, aos[0]! + aos[2]! < aos[1]! + aos[3]!);
    }
  }
  return { opaque: opaque.arrays(), plants: plants.arrays(), liquid: liquid.arrays() };
}
