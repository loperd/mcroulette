import { CanvasTexture, NearestFilter, NearestMipmapNearestFilter, NoColorSpace } from 'three';

/**
 * Block textures the way Minecraft draws them: 16×16 pixels per face, a few shades per material,
 * hard pixels, no smoothing. Painted procedurally (no game assets) into one atlas, so the whole
 * world is one texture and a handful of draw calls.
 */
export const TILE = 16;
const COLUMNS = 8;

type Rand = () => number;
type Painter = (px: (x: number, y: number, color: string | null) => void, rand: Rand) => void;

const pick = (rand: Rand, colors: readonly string[]) => colors[Math.floor(rand() * colors.length)]!;
const speckle = (colors: readonly string[]): Painter => (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, pick(rand, colors)); };

/** Clusters of a colour on a base (ores, dark patches in stone). */
function clusters(px: Parameters<Painter>[0], rand: Rand, colors: readonly string[], count: number, size = 2): void {
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(rand() * (TILE - size)), cy = Math.floor(rand() * (TILE - size));
    for (let k = 0; k < size * 2; k++) px(cx + Math.floor(rand() * (size + 1)), cy + Math.floor(rand() * (size + 1)), pick(rand, colors));
  }
}

const GRASS = ['#5d9b3c', '#68a843', '#55923a', '#73b04a', '#4f8a35'];
const DIRT = ['#866043', '#79553a', '#93694a', '#6c4b33', '#9a7152'];
const STONE = ['#7f7f7f', '#888888', '#767676', '#8f8f8f', '#6e6e6e'];
const DEEPSLATE = ['#4a4a50', '#424248', '#525258', '#3c3c42'];
const END_STONE = ['#dbd99c', '#d2cf92', '#e4e2a9', '#c8c588'];

const PAINTERS: Record<string, Painter> = {
  grass_top: speckle(GRASS),
  dirt: speckle(DIRT),
  grass_side: (px, rand) => {
    speckle(DIRT)(px, rand);
    // The grass overhang: 3–5 pixels, ragged.
    for (let x = 0; x < TILE; x++) { const d = 3 + Math.floor(rand() * 3); for (let y = 0; y < d; y++) px(x, y, pick(rand, GRASS)); }
  },
  stone: (px, rand) => { speckle(STONE)(px, rand); clusters(px, rand, ['#666666', '#6a6a6a'], 5, 3); },
  cobblestone: (px, rand) => {
    speckle(['#7a7a7a', '#878787', '#6f6f6f', '#949494'])(px, rand);
    for (let i = 0; i < 9; i++) { const x = Math.floor(rand() * TILE), y = Math.floor(rand() * TILE); for (let k = 0; k < 4; k++) px((x + k) % TILE, y, '#4e4e4e'); px(x, (y + 1) % TILE, '#4e4e4e'); }
  },
  oak_log: (px, rand) => { for (let x = 0; x < TILE; x++) { const c = pick(rand, ['#6b5130', '#5e4628', '#735a36', '#4f3b21']); for (let y = 0; y < TILE; y++) px(x, y, rand() < .15 ? '#4a371f' : c); } },
  oak_log_top: (px, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      px(x, y, r > 6.5 ? pick(rand, ['#5e4628', '#4f3b21']) : Math.floor(r) % 2 ? '#b8945f' : '#a07f4f');
    }
  },
  oak_leaves: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, rand() < .2 ? null : pick(rand, ['#3a7a2a', '#45882f', '#336d25', '#4f9436'])); },
  birch_log: (px, rand) => {
    speckle(['#e3e0d3', '#d8d4c6', '#ece9de'])(px, rand);
    for (let i = 0; i < 6; i++) { const y = Math.floor(rand() * TILE), x = Math.floor(rand() * 12); for (let k = 0; k < 2 + Math.floor(rand() * 3); k++) px(x + k, y, '#3c3a36'); }
  },
  birch_log_top: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); px(x, y, r > 6.5 ? '#e3e0d3' : Math.floor(r) % 2 ? '#d7c595' : '#c6b27c'); void rand; } },
  birch_leaves: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, rand() < .2 ? null : pick(rand, ['#6a9a3e', '#78a84a', '#5f8c37'])); },
  oak_planks: (px, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, y % 4 === 3 ? '#7a5c34' : pick(rand, ['#a8834e', '#9f7b47', '#b08a55']));
    for (let row = 0; row < 4; row++) px((row * 7 + 3) % TILE, row * 4 + 1, '#7a5c34');
  },
  sand: speckle(['#dbd3a0', '#d4cb94', '#e2dbab', '#cec58d']),
  gravel: (px, rand) => { speckle(['#857f7c', '#77716f', '#948d89', '#6a6461'])(px, rand); clusters(px, rand, ['#5a5250', '#a59d98'], 6, 2); },
  snow: speckle(['#f6f9ff', '#eef3fb', '#ffffff', '#e6ecf6']),
  water: speckle(['#3f64c4', '#4470d0', '#3a5cb8', '#4a78d6']),
  lava: (px, rand) => { speckle(['#e5590f', '#f07a14', '#d24a0c', '#ff9a1f'])(px, rand); clusters(px, rand, ['#ffd24a', '#ffe680'], 4, 2); },
  obsidian: (px, rand) => { speckle(['#14101e', '#1b1528', '#0f0c17'])(px, rand); clusters(px, rand, ['#3a2a5c', '#2a1f44'], 5, 2); },
  end_stone: (px, rand) => { speckle(END_STONE)(px, rand); clusters(px, rand, ['#bdb97e', '#ecebb8'], 5, 2); },
  deepslate: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, y % 4 === 0 && rand() < .5 ? '#35353a' : pick(rand, DEEPSLATE)); },
  bedrock: speckle(['#2b2b2b', '#4a4a4a', '#1a1a1a', '#5c5c5c']),
  diamond_ore: (px, rand) => { PAINTERS.stone!(px, rand); clusters(px, rand, ['#5decf5', '#8ff4f9', '#2fb8c2'], 5, 2); },
  gold_ore: (px, rand) => { PAINTERS.stone!(px, rand); clusters(px, rand, ['#fcee4b', '#f8c838', '#fff59a'], 5, 2); },
  redstone_ore: (px, rand) => { PAINTERS.stone!(px, rand); clusters(px, rand, ['#ff1d1d', '#c40e0e', '#ff5a5a'], 5, 2); },
  emerald_ore: (px, rand) => { PAINTERS.stone!(px, rand); clusters(px, rand, ['#17dd62', '#41f384', '#0f9f45'], 4, 2); },
  glowstone: (px, rand) => { speckle(['#f9d49c', '#e8b65a', '#ffe7a8', '#cd8f39'])(px, rand); },
  torch: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let y = 6; y < 16; y++) { px(7, y, '#7a5a34'); px(8, y, '#5e4527'); }
    px(7, 5, '#ffe9a8'); px(8, 5, '#ffd65a'); px(7, 4, '#ffd65a'); px(8, 4, '#ffa22a'); px(7, 6, '#ff9a1f'); px(8, 6, '#ffcf5a');
  },
  poppy: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let y = 8; y < 16; y++) px(8, y, '#3d7a2a');
    px(7, 12, '#3d7a2a'); px(6, 11, '#4a8f33');
    for (const [x, y] of [[7, 5], [8, 5], [9, 5], [7, 6], [9, 6], [8, 7], [7, 7], [9, 7], [8, 4]] as const) px(x, y, '#e3262a');
    px(8, 6, '#2b1a0f');
  },
  dandelion: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let y = 9; y < 16; y++) px(8, y, '#4a8f33');
    for (const [x, y] of [[7, 7], [8, 7], [9, 7], [8, 6], [8, 8], [7, 8], [9, 8]] as const) px(x, y, '#ffe11c');
  },
  tall_grass: (px, rand) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let blade = 0; blade < 7; blade++) {
      const x = 1 + Math.floor(rand() * 14), h = 6 + Math.floor(rand() * 9);
      for (let y = TILE - h; y < TILE; y++) px(x + (y < 8 && rand() < .3 ? 1 : 0), y, pick(rand, GRASS));
    }
  },
  pumpkin_side: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, x % 4 === 0 ? '#b8600f' : pick(rand, ['#e3851a', '#d97a14', '#ec9022'])); },
  pumpkin_top: (px, rand) => { speckle(['#e3851a', '#d97a14'])(px, rand); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) px(x, y, '#5a7a24'); },
  chorus: (px, rand) => speckle(['#5a3d6e', '#6b4a80', '#4e3361'])(px, rand),
  chorus_flower: (px, rand) => { speckle(['#b07fd0', '#c89ae2', '#9a6abc'])(px, rand); },
  purpur: (px, rand) => { for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, x % 8 === 0 || y % 8 === 0 ? '#8a5c8a' : pick(rand, ['#a879a8', '#b386b3', '#9e6f9e'])); },
  end_rod: (px) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(x, y, null);
    for (let y = 0; y < 16; y++) { px(7, y, '#f8f4ff'); px(8, y, '#e6dcf2'); }
  },
  amethyst: (px, rand) => { speckle(['#8a5cc8', '#a678e0', '#7346b0', '#c29af2'])(px, rand); },
};

export type TileName = keyof typeof PAINTERS;

let atlas: { texture: CanvasTexture; uv: Map<string, [number, number, number, number]> } | undefined;

/** The block atlas (built once). `uv(name)` gives [u0, v0, u1, v1] of a tile. */
export function blockAtlas(): { texture: CanvasTexture; uv: (name: string) => [number, number, number, number] } {
  if (!atlas) {
    const names = Object.keys(PAINTERS), rows = Math.ceil(names.length / COLUMNS), size = COLUMNS * TILE;
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: rows * TILE });
    const g = canvas.getContext('2d')!;
    const uv = new Map<string, [number, number, number, number]>();
    names.forEach((name, index) => {
      const col = index % COLUMNS, row = Math.floor(index / COLUMNS);
      let state = (index + 1) * 2654435761 >>> 0;
      const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
      PAINTERS[name]!((x, y, color) => {
        if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
        if (color === null) g.clearRect(col * TILE + x, row * TILE + y, 1, 1);
        else { g.fillStyle = color; g.fillRect(col * TILE + x, row * TILE + y, 1, 1); }
      }, rand);
      // Half a texel inset: neighbouring tiles never bleed in at grazing angles.
      const inset = .02;
      uv.set(name, [(col * TILE + inset) / size, 1 - (row * TILE + TILE - inset) / canvas.height, (col * TILE + TILE - inset) / size, 1 - (row * TILE + inset) / canvas.height]);
    });
    const texture = new CanvasTexture(canvas);
    texture.magFilter = NearestFilter; texture.minFilter = NearestMipmapNearestFilter;
    // Shown as painted (the view does no colour management, like the game).
    texture.colorSpace = NoColorSpace;
    atlas = { texture, uv };
  }
  const { texture, uv } = atlas;
  return { texture, uv: name => uv.get(name) ?? uv.get('stone')! };
}
