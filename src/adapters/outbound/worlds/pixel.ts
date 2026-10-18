/**
 * Pixel-art primitives for the worlds. Everything is drawn at a low resolution (about 384×216) on
 * integer coordinates and scaled up without smoothing: crisp Minecraft pixels, almost no cost.
 */
export type Rand = () => number;

/** Deterministic random (mulberry32): the same seed paints the same world. */
export function seeded(seed: number): Rand {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Size { readonly width: number; readonly height: number }

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** A canvas to paint a still layer into once. */
export function layerCanvas(size: Size): { canvas: HTMLCanvasElement | OffscreenCanvas; g: Painter } {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size.width, size.height)
    : Object.assign(document.createElement('canvas'), { width: size.width, height: size.height });
  const context = canvas.getContext('2d') as Context2D | null;
  if (!context) throw new Error('2D canvas is unavailable.');
  return { canvas, g: new Painter(context) };
}

export class Painter {
  readonly c: Context2D;
  constructor(context: Context2D) { this.c = context; this.c.imageSmoothingEnabled = false; }

  rect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    if (w <= 0 || h <= 0) return;
    this.c.globalAlpha = alpha; this.c.fillStyle = color;
    this.c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    this.c.globalAlpha = 1;
  }

  px(x: number, y: number, color: string, alpha = 1): void { this.rect(x, y, 1, 1, color, alpha); }

  /**
   * Sky in hard bands (the blocky Minecraft look), with a one-pixel checker dither where two bands
   * meet so the steps read as light, not as stripes.
   */
  bands(x: number, y: number, w: number, h: number, colors: readonly string[]): void {
    const step = h / colors.length;
    colors.forEach((color, index) => this.rect(x, y + Math.floor(index * step), w, Math.ceil(step) + 1, color));
    for (let index = 1; index < colors.length; index++) {
      const edge = y + Math.floor(index * step);
      for (let dx = 0; dx < w; dx += 2) this.px(x + dx + (index % 2), edge, colors[index - 1]!);
    }
  }

  /** A soft round glow (light on the scene: lava, torches, the sun), smooth over the pixels. */
  glow(cx: number, cy: number, radius: number, color: string, alpha: number): void {
    if (radius <= 0 || alpha <= 0) return;
    const gradient = this.c.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent');
    this.c.globalAlpha = Math.min(1, alpha); this.c.fillStyle = gradient;
    this.c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    this.c.globalAlpha = 1;
  }

  /** A filled polygon on whole pixels (scanline, no anti-aliasing): wings, membranes, silhouettes. */
  polygon(points: readonly (readonly [number, number])[], color: string, alpha = 1): void {
    if (points.length < 3) return;
    const ys = points.map(p => p[1]), top = Math.floor(Math.min(...ys)), bottom = Math.ceil(Math.max(...ys));
    for (let y = top; y <= bottom; y++) {
      const crossings: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]!, [x2, y2] = points[(i + 1) % points.length]!;
        if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) this.rect(Math.round(crossings[i]!), y, Math.round(crossings[i + 1]!) - Math.round(crossings[i]!) + 1, 1, color, alpha);
    }
  }

  draw(image: CanvasImageSource, x: number, y: number): void { this.c.drawImage(image, Math.round(x), Math.round(y)); }
}

/** Mix two #rrggbb colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const p = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const c = (i: number) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
}

/** A blocky ridge line: a random walk in whole steps, smoothed so it reads as terrain, not noise. */
export function ridge(width: number, base: number, amplitude: number, step: number, rand: Rand, roughness = .5): number[] {
  const heights: number[] = [];
  let h = base + (rand() - .5) * amplitude, trend = 0;
  for (let x = 0; x < width; x += step) {
    trend = trend * (1 - roughness) + (rand() - .5) * amplitude * roughness;
    h = Math.max(base - amplitude, Math.min(base + amplitude, h + trend));
    const snapped = Math.round(h / 2) * 2;
    for (let i = 0; i < step && x + i < width; i++) heights.push(snapped);
  }
  return heights;
}
