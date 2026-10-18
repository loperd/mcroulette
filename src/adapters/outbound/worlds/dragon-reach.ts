import { mix, seeded, type Painter, type Rand, type Size } from './pixel.ts';
import { islandGround } from './end-stone.ts';
import { stillLayer, type Actor, type StillLayer, type WorldContext, type WorldScene } from './pixel-world.ts';

/**
 * The dragon's reach ("Предел Дракона"): the end of the End — a ring of obsidian towers with
 * crystals on top, pink healing beams, the exit portal's bedrock frame below, and the dragon
 * circling far off. Alive: crystals turn, beams follow the dragon, breath lingers in violet clouds.
 * Now and then the dragon sweeps low over the chest: a heavy shake, a blast of air, violet light.
 */
const OBSIDIAN = '#160d22', EDGE = '#4a2d6e';

function tower(g: Painter, x: number, base: number, height: number, width: number, fade: number, rand: Rand): void {
  const shade = (c: string) => mix(c, '#07040c', fade);
  g.rect(x, base - height, width, height, shade(OBSIDIAN));
  g.rect(x, base - height, 1, height, shade(EDGE));
  for (let y = base - height + 2; y < base; y += 4) if (rand() < .5) g.px(x + 1 + Math.floor(rand() * (width - 2)), y, shade('#4c2e70'));
  // An iron cage around the crystal on some towers.
  if (rand() < .4) { g.rect(x - 1, base - height - 6, width + 2, 1, shade('#9a9aa8')); g.rect(x - 1, base - height - 6, 1, 6, shade('#9a9aa8')); g.rect(x + width, base - height - 6, 1, 6, shade('#9a9aa8')); }
}

/** The tower ring: fixed by its own seed, so the painted towers and the crystals on them agree. */
function towersOf(size: Size): { x: number; top: number; width: number; fade: number }[] {
  const rand = seeded(9001), base = Math.round(size.height * .48);
  return [.04, .14, .26, .74, .86, .96, .36, .64].map((at, i) => {
    const near = i < 6, width = near ? 9 + Math.round(rand() * 4) : 6, height = near ? 60 + rand() * 50 : 40 + rand() * 25;
    return { x: Math.round(size.width * at), top: Math.round(base - height), width, fade: near ? .1 : .45 };
  });
}

function paint(size: Size, rand: Rand, pad: number): readonly StillLayer[] {
  const { width: W, height: H } = size;
  const sky = stillLayer(size, pad, 0, g => {
    g.bands(-pad, 0, W + pad * 2, H, ['#05030a', '#080510', '#0d0717', '#13091f', '#1a0c28', '#220f32', '#2a1238']);
    for (let i = 0; i < 6; i++) g.glow(-pad + rand() * (W + pad * 2), H * (.2 + rand() * .4), 40 + rand() * 40, '#4a1f5e', .25);
    for (let i = 0; i < 90; i++) g.px(-pad + rand() * (W + pad * 2), rand() * H * .7, '#cdb8f0', .2 + rand() * .6);
  });
  const towers = stillLayer(size, pad, .3, g => {
    const base = Math.round(H * .48), list = towersOf(size);
    for (const t of [...list].sort((a, b) => b.fade - a.fade)) tower(g, t.x, base, base - t.top, t.width, t.fade, rand);
  });
  const ground = stillLayer(size, pad, .6, g => {
    const top = Math.round(H * .48);
    islandGround(g, W, H, top, pad, rand);
    // The exit portal's bedrock rim, right under the chest.
    const cx = W / 2, y = top + 14;
    for (let x = cx - 46; x < cx + 46; x += 4) {
      const ring = Math.abs(x - cx) > 30;
      g.rect(x, y + (ring ? 0 : 6), 4, ring ? 10 : 4, ring ? '#3c3c3c' : '#262626');
      g.px(x + 1, y + (ring ? 2 : 7), '#5a5a5a');
    }
    g.rect(cx - 30, y + 2, 60, 4, '#07040c');
  });
  return [sky, towers, ground];
}

class Dragon implements Actor {
  readonly depth = .2;
  private readonly size: Size;
  private readonly tops: { x: number; y: number }[];
  private angle = 0;
  private flap = 0;
  private swoop = -1; // < 0 circling; 0..1 sweeping low over the chest
  private next = 16;
  private breath: { x: number; y: number; r: number; life: number }[] = [];
  private shook = false;
  constructor(size: Size, tops: { x: number; y: number }[]) { this.size = size; this.tops = tops; }
  private where(): { x: number; y: number; scale: number; facing: number } {
    const { width: W, height: H } = this.size;
    if (this.swoop >= 0) {
      const t = this.swoop, x = -60 + (W + 120) * t, y = H * .1 + Math.sin(t * Math.PI) * H * .2;
      return { x, y, scale: 1.4 + Math.sin(t * Math.PI) * 2.2, facing: 1 };
    }
    return { x: W / 2 + Math.cos(this.angle) * W * .38, y: H * .14 + Math.sin(this.angle * 2) * H * .04, scale: 1 + (Math.sin(this.angle) + 1) * .25, facing: -Math.sin(this.angle) >= 0 ? 1 : -1 };
  }
  update(world: WorldContext, dt: number): void {
    this.flap += dt * (this.swoop >= 0 ? 7 : 4);
    if (this.swoop >= 0) {
      this.swoop += dt / 3.2;
      if (!this.shook && this.swoop > .45) {
        this.shook = true;
        world.chest.tremor(.7, 1.4); world.gust(.9, 1); world.chest.light('#b04fe0', .8, 1.2);
        for (let i = 0; i < 6; i++) this.breath.push({ x: this.size.width * (.4 + world.rand() * .3), y: this.size.height * (.36 + world.rand() * .08), r: 6 + world.rand() * 8, life: 3 + world.rand() * 2 });
      }
      if (this.swoop >= 1) { this.swoop = -1; this.shook = false; }
    } else {
      this.angle += dt * .18;
      if ((this.next -= dt) <= 0) { this.next = 30 + world.rand() * 25; this.swoop = 0; }
      if (world.rand() < dt * .3) { const at = this.where(); this.breath.push({ x: at.x, y: at.y + 4, r: 3 + world.rand() * 4, life: 3 + world.rand() * 2 }); }
    }
    for (const b of this.breath) { b.life -= dt; b.r += dt * 2; b.y += dt * 3; b.x += world.wind * 6 * dt; }
    this.breath = this.breath.filter(b => b.life > 0);
  }
  draw(g: Painter, _world: WorldContext, shift: number): void {
    for (const b of this.breath) g.glow(b.x + shift, b.y, b.r * 2, '#9b3fd0', .3 * Math.min(1, b.life / 2));
    const at = this.where(), s = at.scale, x = at.x + shift, y = at.y, wing = Math.sin(this.flap);
    // Healing beams from the crystals to the dragon while it circles.
    if (this.swoop < 0) for (const top of this.tops) if (Math.hypot(top.x - at.x, top.y - at.y) < this.size.width * .35) beam(g, top.x + shift, top.y, x, y);
    drawDragon(g, x, y, s, at.facing, wing);
  }
}

/**
 * The ender dragon as a pixel silhouette, facing right (mirrored for left): long neck and horned
 * head with a violet eye, a tail tapering in a wave, two membrane wings — the far one darker —
 * beating with `wing` (-1 down .. 1 up).
 */
function drawDragon(g: Painter, x: number, y: number, s: number, facing: number, wing: number): void {
  const P = (dx: number, dy: number): [number, number] => [x + dx * s * facing, y + dy * s];
  const BODY = '#0d0a11', WING_NEAR = '#241834', WING_FAR = '#170f22', BONE = '#3a2a4c';
  // A violet halo behind it, or a black dragon vanishes in the black sky.
  g.glow(x - 2 * s * facing, y - 3 * s, 26 * s, '#6c2f96', .5);
  // Far wing first (behind the body), a little smaller.
  const farTip = -14 * wing - 2;
  g.polygon([P(2, -1), P(-8, -1), P(-16, farTip + 4), P(-6, farTip)], WING_FAR);
  // Tail: a chain of shrinking blocks along a wave.
  for (let i = 0; i < 12; i++) {
    const tx = -10 - i * 2.4, ty = Math.sin(i * .55 + wing) * 1.6, t = Math.max(1, (3 - i * .2) * s);
    const [px, py] = P(tx, ty);
    g.rect(px - t / 2, py - t / 2, t, t, BODY);
    if (i % 3 === 0) g.px(px, py - t / 2 - 1, BONE);
  }
  // Body.
  g.polygon([P(-11, -1), P(-4, -3), P(6, -3), P(9, -1), P(6, 2), P(-6, 2)], BODY);
  for (let i = -8; i < 6; i += 3) { const [px, py] = P(i, -3.5); g.px(px, py, BONE); }
  // Neck rising to the head.
  g.polygon([P(6, -3), P(12, -7), P(15, -7), P(10, -1)], BODY);
  g.polygon([P(13, -9), P(20, -8.5), P(21, -6.5), P(14, -5.5)], BODY);
  g.polygon([P(15, -9), P(14, -11), P(16, -9)], BONE);
  const [ex, ey] = P(18, -8);
  g.rect(ex, ey, Math.max(1, s), Math.max(1, s * .7), '#d65cff');
  g.glow(ex, ey, 4 * s, '#d65cff', .5);
  // Near wing over the body: a bony arm with the membrane hanging from it.
  const tip = -16 * wing - 3, elbow = -9 * wing - 4;
  g.polygon([P(4, -2), P(-6, -2), P(-14, tip + 6), P(-9, tip), P(-2, elbow)], WING_NEAR);
  g.polygon([P(4, -2), P(-2, elbow), P(-1, elbow + 1), P(4, -1)], BONE);
  g.polygon([P(-2, elbow), P(-9, tip), P(-8, tip + 1), P(-1, elbow + 1)], BONE);
}

function beam(g: Painter, x0: number, y0: number, x1: number, y1: number): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i < steps; i += 2) g.px(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, '#ff8fe0', .55);
}

class Crystals implements Actor {
  readonly depth = .31;
  private readonly tops: { x: number; y: number }[];
  constructor(tops: { x: number; y: number }[]) { this.tops = tops; }
  update(): void {}
  draw(g: Painter, world: WorldContext, shift: number): void {
    for (const [i, c] of this.tops.entries()) {
      const bob = Math.round(Math.sin(world.time * 2 + i) * 1.5), turn = Math.floor(world.time * 4 + i) % 2;
      g.glow(c.x + shift, c.y + bob, 12, '#ff6ad5', .4);
      g.rect(c.x + shift - 3, c.y + bob - 3, 6, 6, '#3a1d4f');
      g.rect(c.x + shift - 2 + turn, c.y + bob - 2, 4 - turn, 4, '#f07bd4');
    }
  }
}

function crystalTops(size: Size): { x: number; y: number }[] {
  return towersOf(size).map(t => ({ x: t.x + Math.round(t.width / 2), y: t.top - 6 }));
}

export const DRAGON_REACH: WorldScene = {
  id: 'dragon',
  calm: .08,
  paint,
  actors: size => {
    const tops = crystalTops(size);
    return [new Crystals(tops), new Dragon(size, tops)];
  },
};
