import {
  BackSide, BufferAttribute, BufferGeometry, Color, DoubleSide, Fog, LinearSRGBColorSpace, Mesh, MeshBasicMaterial, NoToneMapping, PerspectiveCamera,
  Scene, SphereGeometry, Vector3, WebGLRenderer, type Object3D, type Texture,
} from 'three';
import type { MeshArrays, WorldMesh } from './mesher.ts';
import { raw } from './color.ts';

/**
 * Shows a block world: one renderer, a sky dome and fog, a slowly drifting camera, and the stage's
 * living things updated each frame. Built stages are cached for the session. It renders at a reduced
 * resolution, ~30 frames a second, and gives up quality before frames: resolution, then frame rate,
 * then a still picture. Paused while the page is hidden or the user prefers reduced motion.
 *
 * `H` is whatever the host lets the world act on (the app passes its own handles); the library
 * never looks inside it.
 */
export interface StageContext<H> {
  readonly time: number;
  /** Current wind, -1..1. */
  readonly wind: number;
  readonly rand: () => number;
  readonly host: H | undefined;
  /** A gust: the wind rises for a moment. */
  gust(strength: number, side: number): void;
  /** The world flashes (lightning): sky and fog light up for a moment. */
  flash(color: string, strength: number): void;
}

export interface Living<H> { update(context: StageContext<H>, dt: number): void }

export interface Stage<H> {
  readonly root: Object3D;
  readonly living: readonly Living<H>[];
  readonly sky: { readonly top: string; readonly horizon: string; readonly bottom: string };
  readonly fog: { readonly color: string; readonly near: number; readonly far: number };
  readonly camera: { readonly position: readonly [number, number, number]; readonly target: readonly [number, number, number]; readonly fov?: number; readonly drift?: number };
  readonly calm?: number;
}

export interface StageBuilder<H> { readonly id: string; build(seed: number): Stage<H> }

/**
 * The world's clock and wind as seen by the shaders. One set for the page: every view advances it,
 * and the materials read it on the GPU — moving grass and water costs no work on the CPU.
 */
const motion = { time: { value: 0 }, wind: { value: 0 } };

/**
 * The motion layer over the vanilla look: vertices marked free by the mesher sway in the wind
 * (plant tops, leaves), and a liquid's surface rolls in slow waves and glints with the sky's light.
 */
function moving(material: MeshBasicMaterial, kind: 'sway' | 'wave'): MeshBasicMaterial {
  material.onBeforeCompile = shader => {
    shader.uniforms.time = motion.time; shader.uniforms.wind = motion.wind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float sway;
uniform float time;
uniform float wind;
varying vec3 vPlace;`)
      .replace('#include <begin_vertex>', kind === 'sway' ? `#include <begin_vertex>
float phase = position.x * .63 + position.z * .41;
float push = sin(time * 1.7 + phase) * .055 + sin(time * 3.1 + phase * 2.3) * .02 + wind * .14;
transformed.x += sway * push;
transformed.z += sway * (cos(time * 1.3 + phase * 1.4) * .04 + wind * .05);
vPlace = position;` : `#include <begin_vertex>
transformed.y += sway * (sin(time * 1.2 + position.x * .8 + position.z * .3) * .045 + sin(time * 1.9 - position.z * 1.1) * .025 - .03);
vPlace = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float time;
varying vec3 vPlace;`)
      .replace('#include <fog_fragment>', kind === 'wave' ? `float ripple = sin(vPlace.x * 1.7 + time * 1.4) * sin(vPlace.z * 1.3 - time * 1.1) + sin((vPlace.x + vPlace.z) * .9 - time * .8) * .5;
float glint = pow(max(0., ripple * .66), 6.);
gl_FragColor.rgb = gl_FragColor.rgb * (.92 + .1 * ripple) + vec3(1., .86, .66) * glint * .45;
gl_FragColor.a = min(1., gl_FragColor.a + glint * .3);
#include <fog_fragment>` : '#include <fog_fragment>');
  };
  material.customProgramCacheKey = () => `blockworld-${kind}`;
  return material;
}

/** The three materials of a meshed world, sharing one atlas. */
export function worldMeshes(mesh: WorldMesh, atlas: Texture): Mesh[] {
  const opaque = new Mesh(geometry(mesh.opaque), moving(new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: .5 }), 'sway'));
  const plants = new Mesh(geometry(mesh.plants), moving(new MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: .5, side: DoubleSide }), 'sway'));
  const liquid = new Mesh(geometry(mesh.liquid), moving(new MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, opacity: .78, depthWrite: false, side: DoubleSide }), 'wave'));
  liquid.renderOrder = 1;
  return [opaque, plants, liquid].filter(part => (part.geometry.index?.count ?? 0) > 0);
}

export function geometry(arrays: MeshArrays): BufferGeometry {
  const result = new BufferGeometry();
  result.setAttribute('position', new BufferAttribute(arrays.positions, 3));
  result.setAttribute('uv', new BufferAttribute(arrays.uvs, 2));
  result.setAttribute('color', new BufferAttribute(arrays.colors, 3));
  result.setAttribute('sway', new BufferAttribute(arrays.sway ?? new Float32Array(arrays.positions.length / 3), 1));
  result.setIndex(new BufferAttribute(arrays.indices, 1));
  result.computeBoundingSphere();
  return result;
}

const FPS = 30, MIN_FPS = 20;
const stages = new Map<string, Stage<unknown>>();

/** Build a stage ahead of time; later views reuse it instantly. */
export function preloadStage<H>(builder: StageBuilder<H>, seed = 1): void { stageOf(builder, seed); }

function stageOf<H>(builder: StageBuilder<H>, seed: number): Stage<H> {
  const key = `${builder.id}:${seed}`;
  let stage = stages.get(key) as Stage<H> | undefined;
  if (!stage) { stage = builder.build(seed); stages.set(key, stage as Stage<unknown>); }
  return stage;
}

function skyDome(sky: Stage<unknown>['sky']): Mesh {
  const dome = new SphereGeometry(900, 24, 16), colors: number[] = [];
  const top = raw(sky.top), horizon = raw(sky.horizon), bottom = raw(sky.bottom), c = new Color();
  const position = dome.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const h = position.getY(i) / 900;
    if (h >= 0) c.copy(horizon).lerp(top, Math.pow(h, .55)); else c.copy(horizon).lerp(bottom, Math.min(1, -h * 3));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
}

export class BlockView<H> {
  readonly canvas: HTMLCanvasElement;
  private readonly view: Window;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly stage: Stage<H>;
  private readonly dome: Mesh;
  private readonly fog: Fog;
  private readonly fogBase: Color;
  private readonly flashColor = new Color();
  private readonly target = new Vector3();
  private host: H | undefined;
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

  constructor(element: HTMLElement, builder: StageBuilder<H>, options: { seed?: number } = {}) {
    this.view = element.ownerDocument.defaultView ?? window;
    this.stage = stageOf(builder, options.seed ?? 1);
    let state = ((options.seed ?? 1) * 9301 + 49297) % 233280;
    this.rand = () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
    this.renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power', stencil: false });
    // The game's look: colours go to the screen as computed, no colour management, no tone curve.
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.quality = Math.min(1, (this.view.devicePixelRatio || 1) * .75);
    this.renderer.setPixelRatio(this.quality);
    this.canvas = this.renderer.domElement;
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    this.canvas.setAttribute('aria-hidden', 'true');
    element.prepend(this.canvas);
    this.camera = new PerspectiveCamera(this.stage.camera.fov ?? 70, 16 / 9, .1, 1200);
    this.fogBase = raw(this.stage.fog.color);
    this.fog = new Fog(this.fogBase.clone(), this.stage.fog.near, this.stage.fog.far);
    this.scene.fog = this.fog;
    this.dome = skyDome(this.stage.sky);
    this.scene.add(this.dome, this.stage.root);
    this.target.set(...this.stage.camera.target);
    this.motion = this.view.matchMedia('(prefers-reduced-motion: reduce)');
    this.motion.addEventListener('change', this.onChange);
    element.ownerDocument.addEventListener('visibilitychange', this.onChange);
    if (typeof ResizeObserver !== 'undefined') { this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(element); }
    this.resize();
    this.sync();
  }

  /** What the world may act on now (or nothing). */
  hold(host: H | undefined): void { this.host = host; }

  /** One frame at a given time (previews, reduced motion). Living things run without a host. */
  renderAt(seconds: number): void {
    const step = 1 / FPS;
    for (let t = 0; t < seconds; t += step) this.tick(step, false);
    this.draw();
  }

  /** The current picture as an image (a still backdrop for screens that need no live world). */
  snapshot(type = 'image/jpeg', quality = .85): string { this.draw(); return this.canvas.toDataURL(type, quality); }

  dispose(): void {
    this.disposed = true; this.running = false;
    this.view.cancelAnimationFrame(this.frame);
    this.canvas.ownerDocument.removeEventListener('visibilitychange', this.onChange);
    this.motion.removeEventListener('change', this.onChange);
    this.resizeObserver?.disconnect();
    // The stage stays cached for the session; only this view's own objects go.
    this.scene.remove(this.stage.root);
    this.dome.geometry.dispose(); (this.dome.material as MeshBasicMaterial).dispose();
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

  private tick(dt: number, live: boolean): void {
    this.time += dt;
    this.gustLevel = Math.max(0, this.gustLevel - dt * .35);
    this.flashLevel = Math.max(0, this.flashLevel - dt * 3.5);
    this.wind = (this.stage.calm ?? .1) * (.7 + .3 * Math.sin(this.time * .7)) + this.gustLevel * this.gustSide;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const context: StageContext<H> = {
      time: this.time, wind: this.wind, rand: this.rand, host: live ? this.host : undefined,
      gust(strength, side) { self.gustLevel = Math.max(self.gustLevel, Math.min(1, strength)); self.gustSide = side < 0 ? -1 : 1; },
      flash(color, strength) { self.flashColor.copy(raw(color)); self.flashLevel = Math.max(self.flashLevel, Math.min(1, strength)); },
    };
    for (const thing of this.stage.living) thing.update(context, dt);
    motion.time.value = this.time; motion.wind.value = this.wind;
  }

  private draw(): void {
    if (this.disposed) return;
    const camera = this.stage.camera, t = this.time, drift = camera.drift ?? 1;
    // A slow drift: the world is a place, not a picture.
    this.camera.position.set(camera.position[0] + Math.sin(t * .05) * 2.2 * drift, camera.position[1] + Math.sin(t * .07) * .4 * drift, camera.position[2] + Math.cos(t * .04) * 1.2 * drift);
    this.camera.lookAt(this.target);
    this.dome.position.copy(this.camera.position);
    this.fog.color.copy(this.fogBase).lerp(this.flashColor, this.flashLevel * .6);
    (this.dome.material as MeshBasicMaterial).color.setScalar(1 + this.flashLevel * 1.5);
    this.renderer.render(this.scene, this.camera);
  }
}
