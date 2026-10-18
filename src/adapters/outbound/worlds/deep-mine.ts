import { layerCanvas, mix, ridge, type Painter, type Rand, type Size } from './pixel.ts';
import { stillLayer, type Actor, type StillLayer, type WorldContext, type WorldScene } from './pixel-world.ts';

/**
 * Deep mines ("Глубинные шахты"): a stone cavern with dripstone, ore veins, a lava lake and torches.
 * Alive: ores glint, lava breathes and spits embers, water drips, torches flicker, bats flutter by.
 * Now and then the mountain settles — dust falls from the ceiling and the chest feels the tremor;
 * a lava flare throws its light on the chest.
 */
const STONE = '#3d3d44', DEEPSLATE = '#232329', FLOOR = '#2e2e34';
/** The cave floor, as a part of the height: level with the chest's base on screen. */
const GROUND = .48;

/** Stone in 8-pixel blocks: each block a little lighter or darker, speckled, with a faint seam. */
function blocks(g: Painter, x0: number, y0: number, w: number, h: number, rand: Rand, base: string, seam = .12): void {
  for (let by = y0; by < y0 + h; by += 8) {
    for (let bx = x0; bx < x0 + w; bx += 8) {
      const tone = mix(base, rand() < .5 ? '#000000' : '#ffffff', rand() * .08);
      const bw = Math.min(8, x0 + w - bx), bh = Math.min(8, y0 + h - by);
      g.rect(bx, by, bw, bh, tone);
      for (let i = 0; i < 6; i++) g.px(bx + Math.floor(rand() * bw), by + Math.floor(rand() * bh), mix(tone, rand() < .6 ? '#000000' : '#ffffff', .18));
      g.rect(bx, by + bh - 1, bw, 1, '#000000', seam); g.rect(bx + bw - 1, by, 1, bh, '#000000', seam * .7);
    }
  }
}

/** A stable pseudo-random 0..1 for a block cell: the same block always gets the same tone. */
function cell(bx: number, by: number, salt = 0): number {
  let h = (Math.imul(bx | 0, 374761393) + Math.imul(by | 0, 668265263) + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The colour of a stone pixel in a block grid: tone per block, speckles per pixel, a seam per edge. */
function stonePixel(x: number, y: number, base: string): string {
  const bx = Math.floor(x / 8), by = Math.floor(y / 8);
  let tone = mix(base, cell(bx, by) < .5 ? '#000000' : '#ffffff', cell(bx, by, 1) * .09);
  const speck = cell(x, y, 2);
  if (speck < .1) tone = mix(tone, '#000000', .2); else if (speck > .94) tone = mix(tone, '#ffffff', .12);
  if (y % 8 === 7 || x % 8 === 7) tone = mix(tone, '#000000', .1);
  return tone;
}

/** An ore block the way Minecraft draws it: stone with a few chunky coloured specks. */
function oreBlock(g: Painter, x: number, y: number, color: string, rand: Rand): void {
  for (let i = 0; i < 4; i++) {
    const px = x + 1 + Math.floor(rand() * 5), py = y + 1 + Math.floor(rand() * 5);
    g.rect(px, py, 2, 2, color); g.px(px, py, mix(color, '#ffffff', .45));
  }
}

const ORES = ['#59e1df', '#f3c94d', '#d8403e', '#4f7bd8', '#3fcf6a'] as const; // diamond, gold, redstone, lapis, emerald

function lakeOf(size: Size): { x: number; y: number; w: number } {
  return { x: Math.round(size.width * .05), y: Math.round(size.height * .56), w: Math.round(size.width * .26) };
}

/** Where the side walls stand, by height: a ragged profile, wider at the floor. */
function wallProfile(H: number, rand: Rand, inset: number): number[] {
  const out: number[] = []; let x = inset, drift = 0;
  for (let y = 0; y < H; y++) {
    drift = drift * .8 + (rand() - .5) * 2.2;
    x = Math.max(inset * .4, Math.min(inset * 1.6, x + drift * .6 + (y / H - .4) * .25));
    out.push(Math.round(x));
  }
  return out;
}

function paint(size: Size, rand: Rand, pad: number): readonly StillLayer[] {
  const { width: W, height: H } = size;
  const back = stillLayer(size, pad, 0, g => {
    blocks(g, -pad, 0, W + pad * 2, H, rand, DEEPSLATE, .2);
    // The tunnel going on into the dark, right behind the chest: depth for the eye.
    g.glow(W / 2, H * .5, H * .55, '#000000', .75);
  });
  const walls = stillLayer(size, pad, .3, g => {
    // Ceiling with pointed dripstone.
    const ceiling = ridge(W + pad * 2, 18, 12, 4, rand, .6);
    ceiling.forEach((bottom, i) => g.rect(i - pad, 0, 1, bottom, STONE));
    blocks(g, -pad, 0, W + pad * 2, 10, rand, STONE);
    for (let x = -pad; x < W + pad; x += 9 + Math.floor(rand() * 16)) {
      const top = ceiling[x + pad]!, length = 8 + Math.floor(rand() * 16);
      for (let k = 0; k < length; k++) { const w = Math.max(1, Math.round(4 * (1 - k / length))); g.rect(x + 2 - Math.floor(w / 2), top + k, w, 1, k > length - 3 ? '#a8957e' : k % 3 ? '#7b6a5a' : '#8d7b69'); }
    }
    // Ragged side walls with ore blocks; their inner edge catches the torchlight.
    for (const side of [-1, 1] as const) {
      const profile = wallProfile(H, rand, W * .17);
      profile.forEach((depth, y) => {
        for (let k = 0; k < depth + pad; k++) {
          // k = 0 at the inner (lit) edge, growing towards the screen edge, which is nearer and darker.
          const x = side < 0 ? depth - 1 - k : W - depth + k;
          g.px(x, y, mix(stonePixel(x + 64, y, STONE), '#0d0d10', Math.min(.7, k / (depth + pad) * .8)));
        }
        g.px(side < 0 ? depth - 1 : W - depth, y, '#66605a');
      });
      for (let i = 0; i < 5; i++) {
        const y = Math.round(H * (.2 + rand() * .55) / 8) * 8, inner = profile[y]!;
        const x = side < 0 ? Math.round((inner - 14 - rand() * 20) / 8) * 8 : Math.round((W - inner + 6 + rand() * 20) / 8) * 8;
        oreBlock(g, x, y, ORES[Math.floor(rand() * ORES.length)]!, rand);
      }
    }
  });
  const floor = stillLayer(size, pad, .6, g => {
    const ground = Math.round(H * GROUND), lake = lakeOf(size);
    const line = ridge(W + pad * 2, ground, 3, 8, rand, .5);
    line.forEach((top, i) => { g.rect(i - pad, top, 1, H - top, FLOOR); g.px(i - pad, top, '#4a4a52'); });
    blocks(g, -pad, ground + 6, W + pad * 2, H - ground - 6, rand, FLOOR, .18);
    // Gravel and pebbles.
    for (let i = 0; i < W * 1.2; i++) g.px(-pad + rand() * (W + pad * 2), ground + 2 + rand() * (H - ground), rand() < .5 ? '#55555c' : '#1e1e22');
    // Rails along the floor, behind the chest.
    for (let x = -pad; x < W + pad; x++) {
      g.px(x, ground + 2, '#7a7a82'); g.px(x, ground + 5, '#7a7a82');
      if (x % 5 === 0) g.rect(x, ground + 1, 2, 6, '#5b3f26');
    }
    // The lava lake's basin rim; the lava itself is alive.
    g.rect(lake.x - 3, lake.y - 2, lake.w + 6, H - lake.y + 2, '#171213');
  });
  return [back, walls, floor];
}

class Lava implements Actor {
  readonly depth = .62;
  private readonly lake: { x: number; y: number; w: number };
  private readonly size: Size;
  private embers: { x: number; y: number; vy: number; life: number }[] = [];
  private flare = 0;
  private nextFlare = 12;
  /** The lava surface lives in its own small buffer, redrawn a few times a second, not every frame. */
  private readonly surface: ReturnType<typeof layerCanvas>;
  private surfaceAt = -1;
  constructor(size: Size) {
    this.size = size; this.lake = lakeOf(size);
    this.surface = layerCanvas({ width: this.lake.w, height: size.height - this.lake.y });
  }
  update(world: WorldContext, dt: number): void {
    this.flare = Math.max(0, this.flare - dt * .8);
    if ((this.nextFlare -= dt) <= 0) {
      this.flare = 1; this.nextFlare = 16 + world.rand() * 18;
      world.chest.light('#ff8a3a', .55, 1.6);
      for (let i = 0; i < 18; i++) this.ember(world, 30);
    }
    if (world.rand() < dt * 4) this.ember(world, 14);
    for (const e of this.embers) { e.y -= e.vy * dt; e.x += world.wind * 10 * dt + (world.rand() - .5) * 4 * dt; e.life -= dt; }
    this.embers = this.embers.filter(e => e.life > 0);
  }
  private ember(world: WorldContext, speed: number): void {
    this.embers.push({ x: this.lake.x + world.rand() * this.lake.w, y: this.lake.y, vy: speed * (.5 + world.rand()), life: 1 + world.rand() * 1.5 });
  }
  draw(g: Painter, world: WorldContext, shift: number): void {
    const { x, y, w } = this.lake, t = world.time, h = this.size.height - y;
    // Its glow on the cave around it, stronger during a flare.
    g.glow(x + w / 2 + shift, y + 4, w * .72, '#ff6a1c', .45 + this.flare * .3 + Math.sin(t * 1.3) * .05);
    if (Math.abs(t - this.surfaceAt) > .15) {
      this.surfaceAt = t;
      for (let row = 0; row < h; row++) {
        for (let col = 0; col < w; col += 3) {
          // Slow blobs of heat with dark crust drifting over them.
          const heat = Math.sin(col * .11 + t * .7) + Math.sin(row * .35 - t * .5 + col * .05) + Math.sin((col + row * 2) * .07 + t * .3);
          const crust = Math.sin(col * .05 - t * .25) + Math.sin(row * .2 + col * .03 + t * .2) > 1.3;
          this.surface.g.rect(col, row, 3, 1, crust ? '#6e2412' : heat > 1.6 ? '#ffe07a' : heat > .6 ? '#ffa531' : heat > -.6 ? '#f06a1f' : '#c03c18');
        }
      }
    }
    g.draw(this.surface.canvas, x + shift, y);
    // Rocks along the shore break the straight edge.
    for (let col = 0; col < w; col += 3) {
      const rock = Math.floor(cell(col, 7, 3) * 4) - 1;
      if (rock > 0) g.rect(x + col + shift, y, 3, rock, '#2a2224');
    }
    for (const e of this.embers) g.px(e.x + shift, e.y, e.life > .6 ? '#ffd27a' : '#ff7a3a', Math.min(1, e.life));
  }
}

class Torches implements Actor {
  readonly depth = .35;
  private readonly torches: { x: number; y: number; phase: number }[];
  constructor(size: Size, rand: Rand) {
    this.torches = [.22, .78, .4, .63].map(x => ({ x: Math.round(size.width * x), y: Math.round(size.height * (.26 + rand() * .1)), phase: rand() * 9 }));
  }
  update(_world: WorldContext, dt: number): void { for (const torch of this.torches) torch.phase += dt; }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const t of this.torches) {
      const flicker = .8 + Math.sin(t.phase * 11) * .1 + Math.sin(t.phase * 27) * .06;
      g.glow(t.x + shift + 1, t.y - 2, 26, '#ffb04a', .35 * flicker);
      g.rect(t.x + shift, t.y, 2, 6, '#6b4a2a');
      g.rect(t.x + shift, t.y - 3, 2, 3, flicker > .85 ? '#ffe28a' : '#ffb347');
      g.px(t.x + shift + (flicker > .82 ? 1 : 0), t.y - 4, '#fff1b8', .8);
    }
  }
}

class Glints implements Actor {
  readonly depth = .31;
  private readonly spots: { x: number; y: number; color: string; phase: number; speed: number }[];
  constructor(size: Size, rand: Rand) {
    this.spots = Array.from({ length: 22 }, () => {
      let x = rand() * size.width; while (Math.abs(x / size.width - .5) < .3) x = rand() * size.width;
      return { x, y: size.height * .12 + rand() * size.height * .6, color: ORES[Math.floor(rand() * 2)]!, phase: rand() * 20, speed: .6 + rand() };
    });
  }
  update(_world: WorldContext, dt: number): void { for (const spot of this.spots) spot.phase += dt * spot.speed; }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const s of this.spots) {
      const shine = Math.max(0, Math.sin(s.phase) ** 15);
      if (shine < .05) continue;
      g.px(s.x + shift, s.y, '#ffffff', shine);
      g.px(s.x + shift - 1, s.y, s.color, shine * .7); g.px(s.x + shift + 1, s.y, s.color, shine * .7);
      g.px(s.x + shift, s.y - 1, s.color, shine * .7); g.px(s.x + shift, s.y + 1, s.color, shine * .7);
    }
  }
}

class Drips implements Actor {
  readonly depth = .4;
  private readonly size: Size;
  private drops: { x: number; y: number; vy: number; splash: number; landed: boolean }[] = [];
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    if (world.rand() < dt * 1.4) this.drops.push({ x: Math.round(world.rand() * this.size.width), y: 30 + world.rand() * 10, vy: 0, splash: 0, landed: false });
    const ground = this.size.height * GROUND;
    for (const d of this.drops) {
      if (d.landed) { d.splash -= dt; continue; }
      d.vy += 160 * dt; d.y += d.vy * dt;
      if (d.y >= ground) { d.y = ground; d.landed = true; d.splash = .25; }
    }
    this.drops = this.drops.filter(d => !d.landed || d.splash > 0);
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const d of this.drops) {
      if (d.landed) { g.px(d.x + shift - 1, d.y - 1, '#8fc9ff', d.splash * 3); g.px(d.x + shift + 1, d.y - 1, '#8fc9ff', d.splash * 3); }
      else { g.px(d.x + shift, d.y, '#9fd3ff'); g.px(d.x + shift, d.y - 1, '#6fa9e0', .6); }
    }
  }
}

class Bats implements Actor {
  readonly depth = .45;
  private readonly size: Size;
  private bats: { x: number; y: number; vx: number; flap: number }[] = [];
  private wait = 7;
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    if ((this.wait -= dt) <= 0 && !this.bats.length) {
      const fromLeft = world.rand() < .5, n = 1 + Math.floor(world.rand() * 3);
      this.bats = Array.from({ length: n }, (_, i) => ({ x: fromLeft ? -8 - i * 9 : this.size.width + 8 + i * 9, y: 40 + world.rand() * 50, vx: (fromLeft ? 1 : -1) * (34 + world.rand() * 14), flap: world.rand() * 6 }));
      this.wait = 18 + world.rand() * 20;
    }
    for (const b of this.bats) { b.x += b.vx * dt; b.flap += dt * 16; b.y += Math.sin(b.flap * .3) * 10 * dt; }
    if (this.bats.length && this.bats.every(b => b.x < -20 || b.x > this.size.width + 20)) this.bats = [];
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const b of this.bats) {
      const up = Math.sin(b.flap) > 0, x = b.x + shift;
      g.rect(x, b.y, 2, 2, '#1b1416');
      g.rect(x - 3, b.y + (up ? -1 : 1), 3, 1, '#2a1f22'); g.rect(x + 2, b.y + (up ? -1 : 1), 3, 1, '#2a1f22');
    }
  }
}

/** The mountain settles: dust falls from the ceiling, and the chest feels the ground shake. */
class Settling implements Actor {
  readonly depth = .5;
  private readonly size: Size;
  private next = 22;
  private dust: { x: number; y: number; vy: number }[] = [];
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    if ((this.next -= dt) <= 0) {
      this.next = 28 + world.rand() * 26;
      world.chest.tremor(.4 + world.rand() * .25, 1.2);
      const at = world.rand() * this.size.width;
      for (let i = 0; i < 40; i++) this.dust.push({ x: at + (world.rand() - .5) * 60, y: 20 + world.rand() * 12, vy: 10 + world.rand() * 25 });
    }
    for (const d of this.dust) d.y += d.vy * dt;
    this.dust = this.dust.filter(d => d.y < this.size.height * GROUND);
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const d of this.dust) g.px(d.x + shift, d.y, '#9a8f84', .7);
  }
}

export const DEEP_MINE: WorldScene = {
  id: 'deep-mine',
  calm: .02,
  paint,
  actors: (size, rand) => [new Glints(size, rand), new Torches(size, rand), new Drips(size), new Bats(size), new Settling(size), new Lava(size)],
};
