import {
  BackSide, BufferAttribute, Color, Fog, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, SphereGeometry, Vector3, WebGLRenderer, type Object3D,
} from 'three';
import { NO_CHEST, type ChestHandles } from '../../../application/ports/chest-handles.ts';
import { disposeObject } from '../chest/dispose-object.ts';

/**
 * A living 3D block world behind the chest. Each world is built ONCE per session into a few meshes
 * (the terrain is one baked mesh: no lights, no shadows at run time) and cached; living things are a
 * handful of small meshes and point clouds. It renders at a reduced resolution, ~30 frames a second,
 * and gives up quality before it gives up frames: resolution first, then frame rate, then a still.
 * Paused while the tab is hidden or when the player prefers reduced motion.
 *
 * The world may pull the chest's handles (wind, tremor, light); the chest never affects the world.
 */
export interface WorldContext {
  readonly time: number;
  /** Current wind, -1..1; living things lean into it. */
  readonly wind: number;
  readonly rand: () => number;
  readonly chest: ChestHandles;
  /** A gust: the wind rises for a moment and the chest feels it. */
  gust(strength: number, side: number): void;
  /** The whole world flashes (lightning): sky and fog light up for a moment. */
  flash(color: string, strength: number): void;
}

export interface Living { update(world: WorldContext, dt: number): void }

export interface BuiltWorld {
  readonly root: Object3D;
  readonly living: readonly Living[];
  readonly sky: { readonly top: string; readonly horizon: string; readonly bottom: string };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly camera: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov?: number };
  /** Calm wind of this world. */
  readonly calm: number;
}

export interface VoxelWorldScene {
  readonly id: string;
  build(seed: number): BuiltWorld;
}

const FPS = 30, MIN_FPS = 20;
const built = new Map<string, BuiltWorld>();

/** Build a world ahead of time (the warm-up after sign-in); later mounts reuse it instantly. */
export function preloadWorld(scene: VoxelWorldScene, seed = 1): void { worldOf(scene, seed); }

function worldOf(scene: VoxelWorldScene, seed: number): BuiltWorld {
  const key = `${scene.id}:${seed}`;
  let world = built.get(key);
  if (!world) { world = scene.build(seed); built.set(key, world); }
  return world;
}

function skyDome(sky: BuiltWorld['sky']): Mesh {
  const geometry = new SphereGeometry(900, 24, 16);
  const colors: number[] = [], top = new Color(sky.top), horizon = new Color(sky.horizon), bottom = new Color(sky.bottom), c = new Color();
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const h = position.getY(i) / 900;
    if (h >= 0) c.copy(horizon).lerp(top, Math.pow(h, .55)); else c.copy(horizon).lerp(bottom, Math.min(1, -h * 3));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return new Mesh(geometry, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
}

export class VoxelWorld {
  readonly canvas: HTMLCanvasElement;
  private readonly view: Window;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly world: BuiltWorld;
  private readonly dome: Mesh;
  private readonly fog: Fog;
  private readonly fogBase: Color;
  private readonly flashColor = new Color();
  private chest: ChestHandles = NO_CHEST;
  private time = 0;
  private wind = 0;
  private gustLevel = 0;
  private gustSide = 1;
  private flashLevel = 0;
  private running = false;
  private disposed = false;
  private frame = 0;
  private last = 0;
  private fps = FPS;
  private quality: number;
  private slow = 0;
  private readonly rand: () => number;
  private readonly motion: MediaQueryList;
  private readonly onChange = () => this.sync();
  private readonly resizeObserver?: ResizeObserver;

  constructor(host: HTMLElement, scene: VoxelWorldScene, options: { seed?: number } = {}) {
    this.view = host.ownerDocument.defaultView ?? window;
    this.world = worldOf(scene, options.seed ?? 1);
    let state = (options.seed ?? 1) * 9301 + 49297;
    this.rand = () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
    // Cheap by construction: no antialiasing (blocks have straight edges), no alpha, low-power GPU.
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power', stencil: false });
    this.quality = Math.min(1, (this.view.devicePixelRatio || 1) * .75);
    this.renderer.setPixelRatio(this.quality);
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    this.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(this.canvas);
    const cam = this.world.camera;
    this.camera = new PerspectiveCamera(cam.fov ?? 45, 16 / 9, .5, 1200);
    this.fogBase = new Color(this.world.fog.color);
    this.fog = new Fog(this.world.fog.color, this.world.fog.near, this.world.fog.far);
    this.scene.fog = this.fog;
    this.dome = skyDome(this.world.sky);
    this.scene.add(this.dome, this.world.root);
    this.motion = this.view.matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', this.onChange);
    host.ownerDocument.addEventListener('visibilitychange', this.onChange);
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host); }
    this.resize();
    this.sync();
  }

  hold(chest: ChestHandles | undefined): void { this.chest = chest ?? NO_CHEST; }

  /** One frame at a given time (previews and reduced motion). */
  renderAt(seconds: number): void {
    const step = 1 / FPS;
    for (let t = 0; t < seconds; t += step) this.tick(step, false);
    this.draw();
  }

  dispose(): void {
    this.disposed = true; this.running = false;
    this.view.cancelAnimationFrame(this.frame);
    this.canvas.ownerDocument.removeEventListener('visibilitychange', this.onChange);
    this.motion.removeEventListener('change', this.onChange);
    this.resizeObserver?.disconnect();
    // The built world stays cached for the session; only this view's own things go.
    this.scene.remove(this.world.root);
    disposeObject(this.dome);
    this.renderer.dispose();
    this.canvas.remove();
  }

  private resize(): void {
    const box = this.canvas.parentElement?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return;
    this.renderer.setSize(box.width, box.height, false);
    this.camera.aspect = box.width / box.height;
    this.camera.updateProjectionMatrix();
    this.draw();
  }

  private sync(): void {
    const live = !this.disposed && this.canvas.ownerDocument.visibilityState !== 'hidden' && !this.motion.matches;
    if (live && !this.running) { this.running = true; this.last = this.view.performance.now(); this.frame = this.view.requestAnimationFrame(this.loop); }
    else if (!live && this.running) { this.running = false; this.view.cancelAnimationFrame(this.frame); if (!this.disposed) this.draw(); }
  }

  private readonly loop = (now: number) => {
    if (!this.running) return;
    this.frame = this.view.requestAnimationFrame(this.loop);
    const elapsed = (now - this.last) / 1000;
    if (elapsed < 1 / this.fps - .002) return;
    this.last = now;
    const started = this.view.performance.now();
    this.tick(Math.min(elapsed, .1), true);
    this.draw();
    this.budget(this.view.performance.now() - started);
  };

  /** A weak machine must not pay for the scenery: lower resolution, then fewer frames, then a still. */
  private budget(spentMs: number): void {
    this.slow = spentMs > 12 ? this.slow + 1 : Math.max(0, this.slow - 1);
    if (this.slow < 20) return;
    this.slow = 0;
    if (this.quality > .45) { this.quality = Math.max(.4, this.quality - .15); this.renderer.setPixelRatio(this.quality); this.resize(); return; }
    if (this.fps > MIN_FPS) { this.fps = MIN_FPS; return; }
    this.running = false; this.view.cancelAnimationFrame(this.frame);
  }

  private context(live: boolean): WorldContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const chest = live ? this.chest : NO_CHEST;
    return {
      time: this.time, wind: this.wind, rand: this.rand, chest,
      gust(strength, side) { self.gustLevel = Math.max(self.gustLevel, Math.min(1, strength)); self.gustSide = side < 0 ? -1 : 1; chest.gust(strength, side); },
      flash(color, strength) { self.flashColor.set(color); self.flashLevel = Math.max(self.flashLevel, Math.min(1, strength)); },
    };
  }

  private tick(dt: number, live: boolean): void {
    this.time += dt;
    this.gustLevel = Math.max(0, this.gustLevel - dt * .35);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 3.5);
    this.wind = this.world.calm * (.7 + .3 * Math.sin(this.time * .7)) + this.gustLevel * this.gustSide;
    const world = this.context(live);
    for (const thing of this.world.living) thing.update(world, dt);
  }

  private draw(): void {
    if (this.disposed) return;
    const cam = this.world.camera, t = this.time;
    // A slow drift of the camera: the world is a place, not a picture.
    this.camera.position.set(cam.position[0] + Math.sin(t * .05) * 2.2, cam.position[1] + Math.sin(t * .07) * .4, cam.position[2] + Math.cos(t * .04) * 1.2);
    this.camera.lookAt(new Vector3(cam.target[0], cam.target[1], cam.target[2]));
    this.dome.position.copy(this.camera.position);
    this.fog.color.copy(this.fogBase).lerp(this.flashColor, this.flashLevel * .6);
    (this.dome.material as MeshBasicMaterial).color.setScalar(1 + this.flashLevel * 1.5);
    this.renderer.render(this.scene, this.camera);
  }
}
