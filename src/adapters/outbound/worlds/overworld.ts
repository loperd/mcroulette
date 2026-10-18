import { mix, ridge, type Painter, type Rand, type Size } from './pixel.ts';
import { stillLayer, type Actor, type StillLayer, type WorldContext, type WorldScene } from './pixel-world.ts';

/**
 * The Overworld at dusk ("Дороги Верхнего мира"): a banded sunset, snow-capped ranges, oak and
 * birch hills, a dirt road winding to the chest. Alive: flat clouds drift, birds cross the sky,
 * lanterns flicker, fireflies wake, leaves blow — and now and then a gust swings the chest's latch.
 */
const SKY = ['#1b1f3a', '#262a4d', '#363762', '#4e4473', '#71517c', '#9a5c78', '#c66f6e', '#e48d68', '#f2ae6b'];
/** Where the sky meets the land, as a part of the height: level with the chest's base on screen. */
const HORIZON = .4;

function sun(g: Painter, x: number, y: number): void {
  g.glow(x + 7, y + 7, 60, '#ffb16b', .6);
  g.rect(x, y, 14, 14, '#ffd98a');
  g.rect(x + 2, y + 2, 10, 10, '#ffe9b0');
}

function oak(g: Painter, x: number, ground: number, rand: Rand, shade: number): void {
  const trunk = mix('#5b3d22', '#2a2033', shade), leaf = mix('#2f6a33', '#1d2b2e', shade), light = mix('#4a8a3e', '#2a3a35', shade);
  const h = 6 + Math.floor(rand() * 4);
  g.rect(x, ground - h, 2, h, trunk);
  g.rect(x - 4, ground - h - 6, 10, 6, leaf);
  g.rect(x - 2, ground - h - 9, 6, 3, leaf);
  for (let i = 0; i < 7; i++) g.px(x - 3 + Math.floor(rand() * 8), ground - h - 8 + Math.floor(rand() * 6), light);
}

function birch(g: Painter, x: number, ground: number, rand: Rand, shade: number): void {
  const bark = mix('#d8d3c2', '#3a3448', shade), leaf = mix('#5f8f3c', '#24302e', shade);
  const h = 9 + Math.floor(rand() * 4);
  g.rect(x, ground - h, 2, h, bark);
  for (let y = ground - h + 2; y < ground; y += 3) g.px(x + (y % 2), y, mix('#3a3433', '#2a2433', shade));
  g.rect(x - 3, ground - h - 5, 8, 6, leaf);
}

function paint(size: Size, rand: Rand, pad: number): readonly StillLayer[] {
  const { width: W, height: H } = size, horizon = Math.round(H * HORIZON);
  const sky = stillLayer(size, pad, 0, g => {
    g.bands(-pad, 0, W + pad * 2, horizon + 6, SKY);
    // A few stars still in the dark top.
    for (let i = 0; i < 40; i++) g.px(-pad + rand() * (W + pad * 2), rand() * horizon * .35, '#cfd3ff', .35 + rand() * .5);
    sun(g, Math.round(W * .68), horizon - 54);
  });
  // Two ranges: the farther one pale in the haze, the nearer one with sunlit slopes and snow.
  const haze = stillLayer(size, pad, .08, g => {
    const peaks = ridge(W + pad * 2, horizon - 30, 16, 6, rand, .4);
    peaks.forEach((top, i) => g.rect(i - pad, top, 1, H - top, '#7d6390'));
  });
  const far = stillLayer(size, pad, .15, g => {
    const peaks = ridge(W + pad * 2, horizon - 24, 20, 4, rand, .45);
    peaks.forEach((top, i) => {
      const x = i - pad, rising = i > 0 && top < peaks[i - 1]!, falling = i > 0 && top > peaks[i - 1]!;
      g.rect(x, top, 1, H - top, '#4b3f6a');
      // The sun is to the right: slopes facing it catch a warm edge.
      if (falling) g.rect(x, top, 1, 6, '#6e5277');
      if (rising) g.rect(x, top, 1, 2, '#3c3258');
      if (top < horizon - 36) g.rect(x, top, 1, 3 + (i % 3), falling ? '#f6cdb9' : '#d9cbe8');
    });
  });
  const mid = stillLayer(size, pad, .35, g => {
    const hills = ridge(W + pad * 2, horizon - 6, 9, 6, rand, .55);
    hills.forEach((top, i) => { const x = i - pad; g.rect(x, top, 1, H - top, '#2d4b3e'); g.px(x, top, '#3f6a45'); });
    for (let x = -pad; x < W + pad; x += 7 + Math.floor(rand() * 9)) {
      const top = hills[x + pad]!;
      (rand() < .7 ? oak : birch)(g, x, top + 1, rand, .55);
    }
  });
  const near = stillLayer(size, pad, .7, g => {
    const ground = horizon + Math.round(H * .07);
    const hills = ridge(W + pad * 2, ground, 5, 8, rand, .5);
    hills.forEach((top, i) => {
      const x = i - pad;
      // Grass blocks all the way down, darker towards the viewer; a block grid every 8 pixels.
      for (let y = top; y < H; y++) {
        const depth = (y - top) / (H - top);
        // Dusk light: warm on the near crest, falling into shade; the block grid only a hint.
        let color = mix('#46733a', '#17291e', Math.min(1, depth * 1.6));
        if ((x + pad) % 8 === 0 || (y - top) % 8 === 7) color = mix(color, '#122016', .14);
        g.px(x, y, color);
      }
      g.rect(x, top, 1, 1, i % 3 ? '#6f9e4a' : '#8aa957');
      if (rand() < .08) g.px(x, top + 2 + Math.floor(rand() * 20), '#5f9f48');
    });
    // Trees on the flanks only: the middle stays open for the chest.
    for (let x = -pad; x < W + pad; x += 12 + Math.floor(rand() * 14)) {
      if (Math.abs(x - W / 2) < W * .2) continue;
      (rand() < .75 ? oak : birch)(g, x, hills[x + pad]! + 1, rand, .15);
    }
    // Flowers and tall grass, never on the road.
    for (let i = 0; i < W * .9; i++) {
      const x = Math.floor(rand() * W), top = hills[x + pad]!, y = top + 2 + Math.floor(rand() * (H - top - 4));
      const t = (y - ground) / (H - ground), road = 4 + t * W * .18 + 3, cx = W / 2 + Math.sin(t * 3 + 1) * 12 * (1 - t);
      if (Math.abs(x - cx) < road) continue;
      const kind = rand();
      if (kind < .12) { g.px(x, y, '#d93a3a'); g.px(x, y + 1, '#2f6a2d'); }
      else if (kind < .22) { g.px(x, y, '#f2d045'); g.px(x, y + 1, '#2f6a2d'); }
      else if (kind < .26) { g.px(x, y, '#8fb8ff'); g.px(x, y + 1, '#2f6a2d'); }
      else { g.px(x, y, '#6aa84a'); g.px(x, y - 1, '#5c9a42', .8); }
    }
    // The road: a dirt path widening towards the viewer, under the chest; grass creeps over its edges.
    for (let y = ground + 2; y < H; y++) {
      const t = (y - ground) / (H - ground), half = 4 + t * W * .18, cx = W / 2 + Math.sin(t * 3 + 1) * 12 * (1 - t);
      g.rect(cx - half, y, half * 2, 1, y % 3 ? '#8a6a45' : '#7d5f3e');
      g.px(cx - half, y, '#5f8a3f'); g.px(cx + half - 1, y, '#5f8a3f');
      if (rand() < .35) g.px(cx - half + rand() * half * 2, y, rand() < .5 ? '#a3825a' : '#6c5236');
    }
  });
  return [sky, haze, far, mid, near];
}

class Clouds implements Actor {
  readonly depth = .08;
  private readonly clouds: { x: number; y: number; w: number; speed: number }[];
  private readonly width: number;
  constructor(size: Size, rand: Rand) {
    this.width = size.width;
    this.clouds = Array.from({ length: 6 }, () => ({ x: rand() * size.width, y: 10 + rand() * size.height * .3, w: 24 + rand() * 40, speed: 1.5 + rand() * 2.5 }));
  }
  update(world: WorldContext, dt: number): void {
    for (const cloud of this.clouds) {
      cloud.x += (cloud.speed + world.wind * 6) * dt;
      if (cloud.x > this.width + 60) cloud.x = -cloud.w - 20;
      if (cloud.x < -cloud.w - 60) cloud.x = this.width + 20;
    }
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const c of this.clouds) {
      // Minecraft clouds: flat slabs, lit pink from below by the sunset.
      g.rect(c.x + shift, c.y, c.w, 4, '#f3c6c8', .82);
      g.rect(c.x + shift + c.w * .2, c.y - 3, c.w * .5, 3, '#fbe0dc', .82);
      g.rect(c.x + shift, c.y + 4, c.w, 1, '#c98a9a', .6);
    }
  }
}

class Birds implements Actor {
  readonly depth = .2;
  private flock: { x: number; y: number; flap: number }[] = [];
  private wait = 6;
  private readonly size: Size;
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    this.wait -= dt;
    if (!this.flock.length && this.wait <= 0) {
      const y = 20 + world.rand() * this.size.height * .25, n = 3 + Math.floor(world.rand() * 4);
      this.flock = Array.from({ length: n }, (_, i) => ({ x: -10 - i * 7, y: y + (i % 2) * 4 + i, flap: world.rand() * 6 }));
      this.wait = 14 + world.rand() * 16;
    }
    for (const bird of this.flock) { bird.x += 18 * dt; bird.flap += dt * 9; }
    if (this.flock.length && this.flock.every(bird => bird.x > this.size.width + 20)) this.flock = [];
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const b of this.flock) {
      const up = Math.sin(b.flap) > 0;
      g.px(b.x + shift, b.y, '#2a2238'); g.px(b.x + shift - 1, b.y + (up ? -1 : 1), '#2a2238'); g.px(b.x + shift + 1, b.y + (up ? -1 : 1), '#2a2238');
    }
  }
}

class Lanterns implements Actor {
  readonly depth = .72;
  private readonly posts: { x: number; y: number; phase: number }[];
  constructor(size: Size, rand: Rand) {
    const ground = Math.round(size.height * (HORIZON + .07));
    this.posts = [size.width * .3, size.width * .7].map(x => ({ x: Math.round(x + (rand() - .5) * 20), y: ground + 4, phase: rand() * 10 }));
  }
  update(_world: WorldContext, dt: number): void { for (const post of this.posts) post.phase += dt; }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const p of this.posts) {
      const flicker = .75 + Math.sin(p.phase * 9) * .08 + Math.sin(p.phase * 23) * .06;
      g.glow(p.x + shift + 1, p.y - 14, 20, '#ffb35c', .4 * flicker);
      g.rect(p.x + shift, p.y - 12, 2, 14, '#3a2a1e');
      g.rect(p.x + shift - 1, p.y - 17, 4, 5, '#2b2b33');
      g.rect(p.x + shift, p.y - 16, 2, 3, mix('#ffcf6b', '#ff9a3c', 1 - flicker));
    }
  }
}

class Fireflies implements Actor {
  readonly depth = .8;
  private readonly flies: { x: number; y: number; vx: number; vy: number; phase: number }[];
  private readonly size: Size;
  constructor(size: Size, rand: Rand) {
    this.size = size;
    const ground = Math.round(size.height * (HORIZON + .07));
    this.flies = Array.from({ length: 18 }, () => ({ x: rand() * size.width, y: ground - 20 + rand() * 40, vx: (rand() - .5) * 6, vy: (rand() - .5) * 4, phase: rand() * 10 }));
  }
  update(world: WorldContext, dt: number): void {
    for (const f of this.flies) {
      f.phase += dt;
      f.vx += (world.rand() - .5) * 8 * dt + world.wind * 4 * dt; f.vy += (world.rand() - .5) * 6 * dt;
      f.vx *= .97; f.vy *= .97;
      f.x = (f.x + f.vx * dt + this.size.width) % this.size.width; f.y += f.vy * dt;
      const ground = this.size.height * HORIZON;
      if (f.y < ground) f.vy += 3 * dt; if (f.y > this.size.height - 6) f.vy -= 3 * dt;
    }
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const f of this.flies) {
      const on = Math.max(0, Math.sin(f.phase * 1.7));
      if (on < .1) continue;
      g.rect(f.x + shift - 1, f.y - 1, 3, 3, '#d8ff7a', .18 * on);
      g.px(f.x + shift, f.y, '#f1ffb0', .9 * on);
    }
  }
}

/** Leaves on the wind; a gust now and then, which the chest feels too. */
class Wind implements Actor {
  readonly depth = .9;
  private readonly leaves: { x: number; y: number; vy: number; color: string; spin: number }[] = [];
  private nextGust = 9;
  private readonly size: Size;
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    this.nextGust -= dt;
    if (this.nextGust <= 0) {
      const side = world.rand() < .5 ? -1 : 1;
      world.gust(.45 + world.rand() * .45, side);
      for (let i = 0; i < 14; i++) this.leaves.push(this.leaf(world, side));
      this.nextGust = 13 + world.rand() * 14;
    }
    if (world.rand() < dt * .8) this.leaves.push(this.leaf(world, world.wind >= 0 ? 1 : -1));
    for (const leaf of this.leaves) {
      leaf.x += world.wind * 70 * dt + Math.sin(leaf.spin) * 6 * dt; leaf.y += leaf.vy * dt; leaf.spin += dt * 4;
    }
    for (let i = this.leaves.length - 1; i >= 0; i--) {
      const leaf = this.leaves[i]!;
      if (leaf.y > this.size.height || leaf.x < -20 || leaf.x > this.size.width + 20) this.leaves.splice(i, 1);
    }
  }
  private leaf(world: WorldContext, side: number) {
    return { x: side > 0 ? -5 - world.rand() * 40 : this.size.width + 5 + world.rand() * 40, y: world.rand() * this.size.height * .8,
      vy: 6 + world.rand() * 10, color: ['#d9822b', '#b5562a', '#e3b13a', '#6b9a3a'][Math.floor(world.rand() * 4)]!, spin: world.rand() * 6 };
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const l of this.leaves) { g.px(l.x + shift, l.y, l.color); if (Math.sin(l.spin) > 0) g.px(l.x + shift + 1, l.y, l.color, .7); }
  }
}

/**
 * A distant storm over the ranges: a bolt behind the mountains lights the whole sky for a blink —
 * and the chest with it; the thunder comes a second or two later and shakes the ground a little.
 */
class Storm implements Actor {
  readonly depth = .12;
  private readonly size: Size;
  private next = 20;
  private flash = 0;
  private bolt: { x: number; y: number }[] = [];
  private thunder = -1;
  constructor(size: Size) { this.size = size; }
  update(world: WorldContext, dt: number): void {
    this.next -= dt; this.flash = Math.max(0, this.flash - dt * 4);
    if (this.thunder > 0 && (this.thunder -= dt) <= 0) world.chest.tremor(.35, .9);
    if (this.next > 0) return;
    this.next = 30 + world.rand() * 30;
    this.flash = 1;
    // A jagged bolt from the clouds down behind the far range.
    const horizon = this.size.height * HORIZON;
    let x = this.size.width * (.15 + world.rand() * .7), y = 6;
    this.bolt = [{ x, y }];
    while (y < horizon - 30) { x += Math.round((world.rand() - .5) * 8); y += 3 + Math.floor(world.rand() * 4); this.bolt.push({ x, y }); }
    world.chest.light('#dce6ff', .9, .35);
    this.thunder = 1 + world.rand() * 1.2;
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    if (this.flash <= 0) return;
    // The sky lights up; the bolt is visible only in the first moments.
    g.rect(0, 0, this.size.width, this.size.height * HORIZON, '#c9d6ff', .22 * this.flash);
    if (this.flash < .55) return;
    for (let i = 1; i < this.bolt.length; i++) {
      const a = this.bolt[i - 1]!, b = this.bolt[i]!;
      for (let y = a.y; y <= b.y; y++) {
        const x = Math.round(a.x + (b.x - a.x) * ((y - a.y) / Math.max(1, b.y - a.y)));
        g.px(x + shift, y, '#f4f7ff'); g.px(x + shift + 1, y, '#aebfff', .6);
      }
    }
  }
}

export const OVERWORLD: WorldScene = {
  id: 'overworld',
  calm: .12,
  paint,
  actors: (size, rand) => [new Clouds(size, rand), new Storm(size), new Birds(size), new Lanterns(size, rand), new Fireflies(size, rand), new Wind(size)],
};
