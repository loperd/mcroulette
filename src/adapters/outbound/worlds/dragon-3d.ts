import { AdditiveBlending, BoxGeometry, BufferGeometry, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { BlockRegistry, BlockWorld, blockAtlas, computeLight, meshWorld, worldMeshes, type Living, type Stage, type StageBuilder } from '../../../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';
import { driftingMotes, fbm } from './end-3d.ts';

type DragonActor = Living<ChestHandles>;

/**
 * The dragon's reach ("Предел Дракона"): the end of the End — the chest stands in the exit portal's
 * bedrock frame on the main island, a ring of obsidian towers around it with crystals on top, pink
 * healing beams reaching from them to the dragon circling overhead. Now and then the dragon sweeps
 * low over the chest: a heavy shake, a blast of air, violet light.
 */
const BLOCKS = new BlockRegistry([
  { name: 'end_stone', textures: { all: 'end_stone' } },
  { name: 'obsidian', textures: { all: 'obsidian' } },
  { name: 'bedrock', textures: { all: 'bedrock' } },
  // The bedrock a crystal burns on: it lights the tower top as the crystal would.
  { name: 'crystal_base', textures: { all: 'bedrock' }, light: 13 },
]);
const B = { Stone: BLOCKS.id('end_stone'), Obsidian: BLOCKS.id('obsidian'), Bedrock: BLOCKS.id('bedrock'), Base: BLOCKS.id('crystal_base') };
const SX = 144, SY = 48, SZ = 144, OX = -72, OZ = -72, FLOOR = 12;
const CHEST = [.5, FLOOR + 1, .5] as const;
const EYE = [CHEST[0], CHEST[1] + 2.45, CHEST[2] + 9] as const;
/** The dragon's loop: an ellipse in front of the camera (a circle round the chest would pass behind it). */
const ORBIT = { x: 36, z: 28, centre: -34, height: FLOOR + 10, speed: .12 };
/** Where a sweep brings it: above the chest, near enough to loom, far enough to stay whole in the frame. */
const SWOOP = [0, FLOOR + 7, -16] as const;

function build(seed: number): Stage<ChestHandles> {
  let state = seed * 7919 + 13;
  const rand = () => { state = (state * 16807) % 2147483647; return state / 2147483647; };
  const grid = new BlockWorld(SX, SY, SZ, [OX, 0, OZ]);
  // The main island: a broad, gently domed top over a hanging underside.
  for (let gx = 0; gx < SX; gx++) for (let gz = 0; gz < SZ; gz++) {
    const x = gx + OX, z = gz + OZ, d = Math.hypot(x, z) / 64 + (fbm(x / 11, z / 11, seed) - .5) * .25;
    if (d >= 1) continue;
    const top = FLOOR - Math.round(Math.max(0, d - .3) * 7);
    for (let y = Math.max(0, Math.floor(top - 3 - Math.pow(1 - d, .7) * 26)); y <= top; y++) grid.set(gx, y, gz, B.Stone);
  }
  // The exit portal: a bedrock disc under the chest, its rim raised only behind it so the chest stays in full view.
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) {
    const r = Math.hypot(x, z), gx = x - OX, gz = z - OZ;
    if (r > 3.8) continue;
    grid.set(gx, FLOOR, gz, B.Bedrock);
    if (r > 2.6 && z < 0) grid.set(gx, FLOOR + 1, gz, B.Bedrock);
  }
  // The tower ring; none stands between the camera and the chest (camera on +z).
  const towers: { x: number; z: number; top: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + .3, x = Math.round(Math.sin(a) * 46), z = Math.round(-Math.cos(a) * 46);
    if (z > 6 && Math.abs(x) < 20) continue;
    const radius = 2 + (i % 3), top = FLOOR + 7 + Math.floor(rand() * 8);
    for (let y = FLOOR - 4; y < top; y++) for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (dx * dx + dz * dz <= radius * radius + 1) grid.set(x + dx - OX, y, z + dz - OZ, B.Obsidian);
    }
    grid.set(x - OX, top, z - OZ, B.Base);
    towers.push({ x: x + .5, z: z + .5, top: top + 1 });
  }
  computeLight(grid, BLOCKS);
  const { texture, uv } = blockAtlas();
  const root = new Group();
  root.add(...worldMeshes(meshWorld(grid, BLOCKS, { uv, sky: [.55, .5, .68], glow: [1, .55, .9], minimum: .08,
    sun: { direction: [-.4, .75, .5], color: [.7, .62, .85], strength: .25, reach: 24 },
  }), texture));
  const dragon = dragonModel(root);
  return {
    root, calm: .06,
    living: [crystals(root, towers, dragon), flight(dragon), driftingMotes(root, rand)],
    sky: { top: '#06070f', horizon: '#2a1d3a', bottom: '#0e0b18' },
    fog: { color: '#1e1730', near: 50, far: 200 },
    camera: { position: EYE, target: [CHEST[0], CHEST[1] + .75, CHEST[2]], fov: 50, drift: .1, focus: [.5, .44] },
    anchor: CHEST, light: { sky: '#d8c8f0', ground: '#352c48', key: '#f4e4ff', from: [.4, .7, 1] },
    ground: { blocks: { world: grid, registry: BLOCKS, around: [CHEST[0], CHEST[2]], radius: 6 } },
  };
}

/** The dragon from boxes: body, neck, head with violet eyes, tail, two wings hinged at the body. */
function dragonModel(root: Group): { group: Group; wings: Group[] } {
  // Unlit materials, so the colours are the picture: dark, yet lighter than the night sky behind.
  const body = new MeshBasicMaterial({ color: '#34283f' }), wingSkin = new MeshBasicMaterial({ color: '#4a3a5e' }), eye = new MeshBasicMaterial({ color: '#d65cff' });
  const group = new Group();
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material = body, parent: Group = group) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  // Facing +z.
  box(3, 2.4, 8, 0, 0, 0);
  box(1.4, 1.4, 4, 0, .8, 5.5);
  box(2, 1.6, 3, 0, 1, 8.8);
  for (const x of [-.55, .55]) box(.35, .25, .1, x, 1.4, 10.32, eye);
  for (let i = 0; i < 6; i++) box(1.4 - i * .18, 1.2 - i * .14, 2.4, 0, -.1 - i * .1, -5.2 - i * 2.3);
  const wings = [-1, 1].map(side => {
    const hinge = new Group(); hinge.position.set(side * 1.5, .9, 1); group.add(hinge);
    box(10, .25, 5, side * 5, 0, -1, wingSkin, hinge);
    box(10, .5, .5, side * 5, .2, 1.4, body, hinge);
    return hinge;
  });
  group.scale.setScalar(.65);
  root.add(group);
  return { group, wings };
}

/** The dragon circles; every 35–60 s it sweeps low over the chest and the chest feels it. */
function flight({ group, wings }: ReturnType<typeof dragonModel>): DragonActor {
  let angle = 0, next = 20, sweep = -1, struck = false;
  const SWEEP = 6;
  return { update(context, dt) {
    if (sweep < 0 && (next -= dt) <= 0) { sweep = 0; struck = false; next = 35 + context.rand() * 25; }
    // low: 0 on the loop, 1 at the bottom of a sweep.
    const low = sweep < 0 ? 0 : Math.sin(Math.min(1, sweep / SWEEP) * Math.PI);
    if (sweep >= 0 && (sweep += dt) > SWEEP) sweep = -1;
    angle += dt * ORBIT.speed * (1 + low * 1.5);
    const before = group.position.clone(), mix = (a: number, b: number) => a + (b - a) * low;
    const x = mix(Math.sin(angle) * ORBIT.x, SWOOP[0]), z = mix(ORBIT.centre - Math.cos(angle) * ORBIT.z, SWOOP[2]);
    group.position.set(x, mix(ORBIT.height, SWOOP[1]) + Math.sin(context.time * 1.3) * .8, z);
    // Nose along the flight, banked into the turn.
    const moved = group.position.clone().sub(before);
    if (moved.x || moved.z) group.rotation.set(0, Math.atan2(moved.x, moved.z), -.35 * (1 - low));
    const flap = Math.sin(context.time * (3 + low * 3)) * .55;
    wings[0]!.rotation.z = flap; wings[1]!.rotation.z = -flap;
    if (low > .95 && !struck) {
      struck = true;
      const side = x < 0 ? -1 : 1;
      context.host?.tremor(.6, 1.2); context.host?.light('#c06cff', .75, 1);
      context.gust(.9, side); context.flash('#6a2cff', .35);
    }
  } };
}

/** End crystals over the tower tops: they bob and turn; a pink beam from each reaches the dragon. */
function crystals(root: Group, towers: readonly { x: number; z: number; top: number }[], dragon: ReturnType<typeof dragonModel>): DragonActor {
  const core = new MeshBasicMaterial({ color: '#f07bd4' }), cage = new MeshBasicMaterial({ color: '#3a1d4f', wireframe: true });
  const beam = new LineBasicMaterial({ color: '#ff8fe0', transparent: true, opacity: .55, blending: AdditiveBlending, depthWrite: false });
  const items = towers.map(t => {
    const group = new Group(); group.position.set(t.x, t.top + 1.2, t.z);
    group.add(new Mesh(new BoxGeometry(.8, .8, .8), core), new Mesh(new BoxGeometry(1.5, 1.5, 1.5), cage));
    const geometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
    const line = new Line(geometry, beam);
    root.add(group, line);
    return { group, line, y: t.top + 1.2, phase: t.x * .37 };
  });
  return { update(context) {
    const target = dragon.group.position;
    for (const c of items) {
      c.group.position.y = c.y + Math.sin(context.time * 2 + c.phase) * .3;
      c.group.rotation.set(context.time * .9 + c.phase, context.time * 1.3, 0);
      const at = c.line.geometry.attributes.position!;
      at.setXYZ(0, c.group.position.x, c.group.position.y, c.group.position.z); at.setXYZ(1, target.x, target.y, target.z);
      at.needsUpdate = true; c.line.geometry.computeBoundingSphere();
    }
  } };
}

export const DRAGON_3D: StageBuilder<ChestHandles> = { id: 'dragon-3d', build };
