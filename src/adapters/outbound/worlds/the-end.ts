import { layerCanvas, mix, type Painter, type Rand, type Size } from './pixel.ts';
import { islandGround } from './end-stone.ts';
import { stillLayer, type Actor, type StillLayer, type WorldContext, type WorldScene } from './pixel-world.ts';

/**
 * The End ("Коллекция Края"): a black-violet void with stars and a faint nebula, end-stone islands
 * floating at several depths, obsidian pillars crowned with end crystals, chorus trees and end
 * rods. Alive: islands bob, portal particles rise, crystals turn, endermen wander — and teleport.
 * One teleporting close to the chest throws a violet flash and a puff of air at it.
 */
const STONE = '#d8d49a', STONE_SHADE = '#a9a56f', STONE_DARK = '#7b784f', OBSIDIAN = '#1d1230', OBSIDIAN_EDGE = '#5a3a86';

/** A floating island: a flat end-stone top over a jagged, narrowing underside. */
function island(g: Painter, cx: number, top: number, width: number, rand: Rand, fade: number): void {
  const color = (c: string) => mix(c, '#0b0712', fade);
  const half = width / 2;
  for (let x = Math.round(cx - half); x < cx + half; x++) {
    const t = Math.abs(x - cx) / half, depth = Math.max(2, Math.round((1 - t * t) * width * .45 * (.7 + rand() * .5)));
    g.rect(x, top, 1, 2, color(STONE));
    g.rect(x, top + 2, 1, depth, color(STONE_SHADE));
    g.rect(x, top + 2 + Math.round(depth * .6), 1, Math.round(depth * .4), color(STONE_DARK));
    if (rand() < .25) g.px(x, top + 1 + Math.floor(rand() * depth), color(STONE_DARK));
  }
}

function pillar(g: Painter, x: number, base: number, height: number, width: number, fade: number): void {
  g.rect(x, base - height, width, height, mix(OBSIDIAN, '#0b0712', fade));
  g.rect(x, base - height, 1, height, mix(OBSIDIAN_EDGE, '#0b0712', fade));
  for (let y = base - height + 3; y < base; y += 5) g.px(x + 1 + (y % 3), y, mix('#4b2f72', '#0b0712', fade));
}

function chorus(g: Painter, x: number, base: number, rand: Rand, depth = 0): void {
  const h = 4 + Math.floor(rand() * 7);
  g.rect(x, base - h, 2, h, '#6f4a86');
  if (depth < 2 && rand() < .8) { const side = rand() < .5 ? -1 : 1; chorus(g, x + side * 3, base - h + 2, rand, depth + 1); g.rect(Math.min(x, x + side * 3), base - h + 1, 4, 2, '#6f4a86'); }
  g.rect(x - 1, base - h - 2, 4, 3, '#b58ac8'); g.px(x, base - h - 3, '#d9b8e6');
}

function endRod(g: Painter, x: number, base: number): void {
  g.glow(x + .5, base - 5, 8, '#ffffff', .35);
  g.rect(x, base - 9, 1, 9, '#f4eef8'); g.rect(x - 1, base - 1, 3, 1, '#a99cb4');
}

function paint(size: Size, rand: Rand, pad: number): readonly StillLayer[] {
  const { width: W, height: H } = size;
  const sky = stillLayer(size, pad, 0, g => {
    g.bands(-pad, 0, W + pad * 2, H, ['#06040b', '#0a0612', '#0f0819', '#140a21', '#190c27', '#1c0d2b']);
    // A violet nebula, in coarse pixels.
    for (let i = 0; i < 9; i++) g.glow(-pad + rand() * (W + pad * 2), rand() * H * .6, 30 + rand() * 50, rand() < .5 ? '#4a2470' : '#2b1f66', .25);
    for (let i = 0; i < 120; i++) { const b = rand(); g.px(-pad + rand() * (W + pad * 2), rand() * H * .85, b > .9 ? '#ffffff' : '#b9a8e8', .3 + b * .6); }
  });
  const far = stillLayer(size, pad, .1, g => {
    for (let i = 0; i < 5; i++) island(g, -pad + rand() * (W + pad * 2), H * (.08 + rand() * .22), 16 + rand() * 26, rand, .55);
  });
  const mid = stillLayer(size, pad, .3, g => {
    // The main island's back ring of pillars, small and hazy.
    const base = Math.round(H * .44);
    for (const x of [.08, .2, .8, .92]) pillar(g, Math.round(W * x), base, 50 + rand() * 40, 8, .15);
    for (let i = 0; i < 3; i++) island(g, W * (.15 + rand() * .7), H * (.16 + rand() * .14), 30 + rand() * 30, rand, .25);
  });
  const ground = stillLayer(size, pad, .6, g => {
    // The island the chest stands on: it ends in cliffs at both sides and falls into the void;
    // the end stone darkens away from the light and violet seeps up from below.
    const top = Math.round(H * .48);
    islandGround(g, W, H, top, pad, rand);
    // Chorus trees and end rods on the flanks, keeping the middle open for the chest.
    for (let i = 0; i < 9; i++) {
      let x = rand() * W; if (Math.abs(x - W / 2) < W * .2) x = x < W / 2 ? x - W * .2 : x + W * .2;
      (rand() < .6 ? () => chorus(g, Math.round(x), top, rand) : () => endRod(g, Math.round(x), top))();
    }
  });
  return [sky, far, mid, ground];
}

class Crystals implements Actor {
  readonly depth = .31;
  private readonly tops: { x: number; y: number }[];
  constructor(size: Size, rand: Rand) {
    const base = Math.round(size.height * .44);
    this.tops = [.08, .2, .8, .92].map(x => ({ x: Math.round(size.width * x) + 3, y: base - 50 - Math.round(rand() * 40) - 8 }));
  }
  update(): void {}
  draw(g: Painter, world: WorldContext, shift: number): void {
    for (const [i, c] of this.tops.entries()) {
      const turn = Math.floor(world.time * 4 + i) % 4, bob = Math.round(Math.sin(world.time * 2 + i) * 1.5);
      g.glow(c.x + shift, c.y + bob, 14, '#ff6ad5', .35);
      g.rect(c.x + shift - 3, c.y + bob - 3, 6, 6, '#3a1d4f');
      g.rect(c.x + shift - 2 + (turn % 2), c.y + bob - 2, 4 - (turn % 2), 4, '#f07bd4');
      g.px(c.x + shift - 1 + (turn > 1 ? 1 : 0), c.y + bob - 1, '#ffd3f2');
    }
  }
}

class Portal implements Actor {
  readonly depth = .7;
  private readonly size: Size;
  private motes: { x: number; y: number; vy: number; life: number }[] = [];
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    while (this.motes.length < 40) this.motes.push({ x: world.rand() * this.size.width, y: this.size.height * (.3 + world.rand() * .7), vy: 3 + world.rand() * 8, life: 2 + world.rand() * 4 });
    for (const m of this.motes) { m.y -= m.vy * dt; m.x += (world.rand() - .5) * 3 * dt + world.wind * 8 * dt; m.life -= dt; }
    this.motes = this.motes.filter(m => m.life > 0);
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const m of this.motes) g.px(m.x + shift, m.y, m.life > 1.5 ? '#c06cff' : '#7a3fb3', Math.min(1, m.life / 1.5));
  }
}

/** Endermen wander the islands; one may teleport right next to the chest. */
class Endermen implements Actor {
  readonly depth = .62;
  private readonly size: Size;
  private readonly men: { x: number; y: number; dir: number; walk: number; fade: number; burst: { x: number; y: number; vx: number; vy: number; life: number }[] }[];
  private next = 10;
  constructor(size: Size, rand: Rand) {
    this.size = size;
    const top = Math.round(size.height * .48);
    this.men = [.12, .86].map(x => ({ x: size.width * x + (rand() - .5) * 20, y: top, dir: rand() < .5 ? -1 : 1, walk: rand() * 9, fade: 1, burst: [] }));
  }
  update(world: WorldContext, dt: number): void {
    for (const man of this.men) {
      man.walk += dt;
      if (Math.sin(man.walk * .4) > .6) man.x += man.dir * 4 * dt;
      if (man.x < 8 || man.x > this.size.width - 8 || Math.abs(man.x - this.size.width / 2) < this.size.width * .18) man.dir *= -1;
      for (const p of man.burst) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
      man.burst = man.burst.filter(p => p.life > 0);
    }
    if ((this.next -= dt) > 0) return;
    this.next = 14 + world.rand() * 18;
    const man = this.men[Math.floor(world.rand() * this.men.length)]!;
    const puff = (x: number) => { for (let i = 0; i < 16; i++) man.burst.push({ x, y: man.y - 12 + world.rand() * 12, vx: (world.rand() - .5) * 30, vy: (world.rand() - .5) * 30, life: .4 + world.rand() * .6 }); };
    puff(man.x);
    // Most jumps land on the flanks; some right by the chest.
    const close = world.rand() < .45, side = world.rand() < .5 ? -1 : 1;
    man.x = close ? this.size.width / 2 + side * this.size.width * .2 : this.size.width * (side < 0 ? .1 : .9) + (world.rand() - .5) * 30;
    puff(man.x);
    if (close) { world.chest.light('#c070ff', .7, .8); world.gust(.35, -side); }
  }
  draw(g: Painter, world: WorldContext, shift: number): void {
    for (const m of this.men) {
      for (const p of m.burst) g.px(p.x + shift, p.y, '#c76cff', Math.min(1, p.life * 2));
      const x = Math.round(m.x + shift), step = Math.sin(m.walk * 6) > 0 && Math.sin(m.walk * .4) > .6 ? 1 : 0;
      // Tall and thin: long legs, a short body, a head with violet eyes.
      g.rect(x - 1, m.y - 9, 1, 9 - step, '#121014'); g.rect(x + 1, m.y - 9, 1, 9 - (1 - step), '#121014');
      g.rect(x - 2, m.y - 15, 5, 6, '#141117');
      g.rect(x - 3, m.y - 14, 1, 7, '#121014'); g.rect(x + 3, m.y - 14, 1, 7, '#121014');
      g.rect(x - 2, m.y - 19, 5, 4, '#18151b');
      const blink = Math.sin(world.time * .7 + m.x) > .97;
      if (!blink) { g.px(x - 1, m.y - 17, '#e07bff'); g.px(x + 1, m.y - 17, '#e07bff'); }
    }
  }
}

class Bobbing implements Actor {
  readonly depth = .2;
  private readonly isles: { x: number; y: number; w: number; phase: number; canvas: CanvasImageSource }[];
  constructor(size: Size, rand: Rand) {
    this.isles = Array.from({ length: 3 }, () => {
      const w = 14 + Math.round(rand() * 18);
      return { x: rand() * size.width, y: size.height * (.06 + rand() * .2), w, phase: rand() * 9, canvas: makeIsland(w, rand) };
    });
  }
  update(): void {}
  draw(g: Painter, world: WorldContext, shift: number): void {
    for (const isle of this.isles) g.draw(isle.canvas, isle.x + shift - isle.w / 2, isle.y + Math.round(Math.sin(world.time * .4 + isle.phase) * 2));
  }
}

/** A small island painted once into its own buffer, so it can bob without repainting. */
function makeIsland(width: number, rand: Rand): CanvasImageSource {
  const { canvas, g } = layerCanvas({ width, height: Math.ceil(width * .6) + 4 });
  island(g, width / 2, 0, width, rand, .4);
  return canvas;
}

export const THE_END: WorldScene = {
  id: 'end',
  calm: .05,
  paint,
  actors: (size, rand) => [new Bobbing(size, rand), new Crystals(size, rand), new Endermen(size, rand), new Portal(size)],
};
