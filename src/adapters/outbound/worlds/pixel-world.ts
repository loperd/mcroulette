import { NO_CHEST, type ChestHandles } from '../../../application/ports/chest-handles.ts';
import { layerCanvas, Painter, seeded, type Rand, type Size } from './pixel.ts';

/**
 * A living world behind the chest, drawn as pixel art. Still layers (sky, mountains, hills, trees)
 * are painted once per canvas size; every frame only redraws the small living things (clouds,
 * fireflies, drips, endermen, the dragon). About 24 frames a second, paused while the tab is hidden
 * or when the player prefers reduced motion — the chest's own 3D scene keeps all the budget.
 *
 * The world may pull the chest's handles (wind, tremor, light); the chest never affects the world.
 */
export interface WorldContext {
  readonly size: Size;
  readonly rand: Rand;
  /** Current wind, -1..1 (sign is the side it blows to); actors lean into it. */
  readonly wind: number;
  /** Seconds since the world started. */
  readonly time: number;
  readonly chest: ChestHandles;
  /** Start a gust: the wind rises for a moment, and the chest feels it. */
  gust(strength: number, side: number): void;
}

/** A still layer painted once; depth 0 is the far sky, 1 the nearest ground (parallax). */
export interface StillLayer { readonly image: CanvasImageSource; readonly depth: number }

export interface Actor {
  readonly depth: number;
  update(world: WorldContext, dt: number): void;
  draw(g: Painter, world: WorldContext, shift: number): void;
}

export interface WorldScene {
  readonly id: string;
  /** Paint the still layers; `pad` extra pixels on each side leave room for the parallax drift. */
  paint(size: Size, rand: Rand, pad: number): readonly StillLayer[];
  actors(size: Size, rand: Rand): readonly Actor[];
  /** Calm wind of this world, -1..1. */
  readonly calm?: number;
}

const HEIGHT = 270, PAD = 8, FPS = 24, SLOW_FPS = 12;

/**
 * Still layers are painted once per world, width and seed, and kept for the whole session: going
 * back to a case, or between screens, reuses them instantly. `preloadWorld` fills the cache ahead
 * of time (in idle time), so the first frame of a world is ready before the case opens.
 */
const stillCache = new Map<string, readonly StillLayer[]>();
const cacheKey = (scene: WorldScene, width: number, seed: number) => `${scene.id}:${width}:${seed}`;

function stillLayers(scene: WorldScene, size: Size, seed: number): readonly StillLayer[] {
  const key = cacheKey(scene, size.width, seed);
  let layers = stillCache.get(key);
  if (!layers) {
    layers = scene.paint(size, seeded(seed), PAD);
    stillCache.set(key, layers);
    // A handful of worlds at a couple of widths at most; drop the oldest beyond that.
    if (stillCache.size > 12) stillCache.delete(stillCache.keys().next().value!);
  }
  return layers;
}

/** Paint a world's still layers ahead of time, for the given viewport aspect (default 16:9). */
export function preloadWorld(scene: WorldScene, options: { seed?: number; aspect?: number } = {}): void {
  stillLayers(scene, { width: worldWidth(options.aspect ?? 16 / 9), height: HEIGHT }, options.seed ?? 1);
}

function worldWidth(aspect: number): number { return Math.max(320, Math.round(HEIGHT * aspect)); }

export class PixelWorld {
  readonly canvas: HTMLCanvasElement;
  private readonly scene: WorldScene;
  private readonly view: Window;
  private readonly seed: number;
  private chest: ChestHandles = NO_CHEST;
  private g?: Painter;
  private size: Size = { width: 384, height: HEIGHT };
  private layers: readonly StillLayer[] = [];
  private actors: readonly Actor[] = [];
  private rand: Rand;
  private time = 0;
  private wind = 0;
  private gustLevel = 0;
  private gustSide = 1;
  private frame = 0;
  private last = 0;
  private running = false;
  /** Frames a second now: drops to SLOW_FPS when frames run over budget, to a still picture if even that is too much. */
  private fps = FPS;
  private slowFrames = 0;
  private disposed = false;
  private readonly onVisibility = () => this.sync();
  private readonly motion: MediaQueryList;
  private readonly resizeObserver?: ResizeObserver;

  constructor(host: HTMLElement, scene: WorldScene, options: { seed?: number } = {}) {
    this.view = host.ownerDocument.defaultView ?? window;
    this.scene = scene;
    this.seed = options.seed ?? 1;
    this.rand = seeded(this.seed);
    this.canvas = host.ownerDocument.createElement('canvas');
    this.canvas.className = 'pixel-world';
    this.canvas.setAttribute('aria-hidden', 'true');
    // Scaled up by the browser without smoothing: crisp pixels, the GPU does the work.
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', imageRendering: 'pixelated' });
    host.prepend(this.canvas);
    this.motion = this.view.matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', this.onVisibility);
    host.ownerDocument.addEventListener('visibilitychange', this.onVisibility);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.build());
      this.resizeObserver.observe(host);
    }
    this.build();
    this.sync();
  }

  /** The chest this world now holds (or none). Only its handles are ever used. */
  hold(chest: ChestHandles | undefined): void { this.chest = chest ?? NO_CHEST; }

  /** One still frame at a given time (previews, reduced motion). */
  renderAt(seconds: number): void {
    this.time = 0;
    const step = 1 / FPS;
    for (let t = 0; t < seconds; t += step) this.tick(step, false);
    this.draw();
  }

  dispose(): void {
    this.disposed = true; this.running = false;
    this.view.cancelAnimationFrame(this.frame);
    this.canvas.ownerDocument.removeEventListener('visibilitychange', this.onVisibility);
    this.motion.removeEventListener('change', this.onVisibility);
    this.resizeObserver?.disconnect();
    this.canvas.remove();
  }

  private build(): void {
    const box = this.canvas.parentElement?.getBoundingClientRect();
    const aspect = box && box.width > 0 && box.height > 0 ? box.width / box.height : 16 / 9;
    const width = worldWidth(aspect);
    if (this.g && width === this.size.width) return;
    this.size = { width, height: HEIGHT };
    this.canvas.width = width; this.canvas.height = HEIGHT;
    // Opaque: the browser composites it as a plain image, the cheapest kind of layer.
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('2D canvas is unavailable.');
    this.g = new Painter(context);
    // Same seed, same world, whatever the window size.
    this.layers = stillLayers(this.scene, this.size, this.seed);
    this.rand = seeded(this.seed * 7 + 3);
    this.actors = this.scene.actors(this.size, this.rand);
    this.draw();
  }

  private sync(): void {
    const live = !this.disposed && this.canvas.ownerDocument.visibilityState !== 'hidden' && !this.motion.matches;
    if (live && !this.running) {
      this.running = true; this.last = this.view.performance.now();
      this.frame = this.view.requestAnimationFrame(this.loop);
    } else if (!live && this.running) {
      this.running = false; this.view.cancelAnimationFrame(this.frame);
      if (!this.disposed) this.draw();
    }
  }

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.frame = this.view.requestAnimationFrame(this.loop);
    const elapsed = (now - this.last) / 1000;
    if (elapsed < 1 / this.fps) return;
    this.last = now;
    const started = this.view.performance.now();
    this.tick(Math.min(elapsed, .1), true);
    this.draw();
    this.budget(this.view.performance.now() - started);
  };

  /**
   * A weak machine must not pay for the scenery: a world frame should cost a few milliseconds. If
   * it keeps costing more, the world slows to SLOW_FPS, and if even that is too much it stays still.
   */
  private budget(spentMs: number): void {
    this.slowFrames = spentMs > 6 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames < 30) return;
    this.slowFrames = 0;
    if (this.fps > SLOW_FPS) { this.fps = SLOW_FPS; return; }
    this.running = false; this.view.cancelAnimationFrame(this.frame);
  }

  private context(): WorldContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const world = this;
    return {
      size: this.size, rand: this.rand, wind: this.wind, time: this.time, chest: this.chest,
      gust(strength: number, side: number) {
        world.gustLevel = Math.max(world.gustLevel, Math.min(1, strength)); world.gustSide = side < 0 ? -1 : 1;
        world.chest.gust(strength, side);
      },
    };
  }

  private tick(dt: number, live: boolean): void {
    this.time += dt;
    this.gustLevel = Math.max(0, this.gustLevel - dt * .35);
    const calm = this.scene.calm ?? .15;
    // A breathing breeze plus the current gust.
    this.wind = calm * (.7 + .3 * Math.sin(this.time * .7)) + this.gustLevel * this.gustSide;
    const world = this.context();
    const quiet: WorldContext = live ? world : { ...world, chest: NO_CHEST, gust: () => {} };
    for (const actor of this.actors) actor.update(quiet, dt);
  }

  private draw(): void {
    const g = this.g;
    if (!g) return;
    const world = this.context();
    // A slow camera drift: far layers barely move, near ones a few pixels.
    const sway = Math.sin(this.time * .045) * PAD * .9;
    const items: { depth: number; draw: () => void }[] = [
      ...this.layers.map(layer => ({ depth: layer.depth, draw: () => g.draw(layer.image, -PAD + Math.round(sway * layer.depth), 0) })),
      ...this.actors.map(actor => ({ depth: actor.depth, draw: () => actor.draw(g, world, Math.round(sway * actor.depth)) })),
    ];
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();
  }
}

/** Paint a still layer the size of the world plus its parallax margin. */
export function stillLayer(size: Size, pad: number, depth: number, paint: (g: Painter, width: number) => void): StillLayer {
  const width = size.width + pad * 2;
  const { canvas, g } = layerCanvas({ width, height: size.height });
  // Painted with the margin on the left; drawn at -pad.
  g.c.translate(pad, 0);
  paint(g, size.width);
  return { image: canvas, depth };
}
