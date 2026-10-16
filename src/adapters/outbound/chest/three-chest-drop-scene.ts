import { chestEffectColor } from './chest-appearance.ts';
import { createChestAppearance, copyChestAppearance, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import { ENDER_CASE, type ChestModelDefinition } from '../../../config/cases.ts';
import {
  ACESFilmicToneMapping, AnimationMixer, LoopOnce, DirectionalLight, HemisphereLight, Mesh, PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, WebGLRenderer, Vector3,
} from 'three';
import type { ChestDropPort } from '../../../application/ports/chest-preview.ts';
import type { ChestPresentationPort } from '../../../application/ports/chest-presentation.ts';
import { FrameTimeline } from '../browser/frame-timeline.ts';
import { FixedStepper } from '../browser/fixed-stepper.ts';
import { browserFrameEnvironment, FrameScheduler } from '../browser/frame-scheduler.ts';
import { normalizeBaseUrl } from '../data/asset-url.ts';
import { loadChestAssets, type ChestAssets } from './chest-assets.ts';
import { disposeObject } from './dispose-object.ts';
import { createRapierPhysicsWorld } from './rapier-physics-world.ts';
import type { PhysicsWorldPort } from './physics-world-port.ts';
import { ChestFractureEffects } from './chest-fracture-effects.ts';
import { BURST_AT, ChestBreakageEffects } from './chest-breakage-effects.ts';
import { NO_BREAKAGE, type ChestBreakage } from '../../../domain/chest-breakage.ts';
import { ChestImpactEffects } from './chest-impact-effects.ts';
import { ChestOpeningEffects } from './chest-opening-effects.ts';
import { SPAWN_POSE } from './physics-config.ts';

export class ThreeChestDropScene implements ChestDropPort, ChestPresentationPort {
  readonly element: HTMLDivElement;
  private readonly baseUrl: URL;
  private readonly modelDefinition: ChestModelDefinition;
  private readonly appearance: ChestAppearance;
  private readonly onImpact?: () => void;
  private readonly view: Window;
  private readonly document: Document;
  private readonly errors = new Set<(error: unknown) => void>();
  private readonly stepper = new FixedStepper();
  private renderer?: WebGLRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private floor?: Mesh;
  private assets?: ChestAssets;
  private physics?: PhysicsWorldPort;
  private scheduler?: FrameScheduler;
  private observer?: ResizeObserver;
  private detachContextLost?: () => void;
  private detachAbort?: () => void;
  private generation = 0;
  private initialPose = false;
  private prepared = false;
  private disposed = false;
  private mixer?: AnimationMixer;
  private opening?: { advance(delta: number): void; cancel(error: unknown): void };
  private mode: 'preview' | 'drop' | 'opening' | 'stopped' = 'stopped';
  private previewTime = 0;
  private readonly entranceTimeline: FrameTimeline;
  private previewEntrance?: Animation;
  private effects?: ChestOpeningEffects;
  private soundMuted = false;
  private impactEffects?: ChestImpactEffects;
  private fractureEffects?: ChestFractureEffects;
  private breakageEffects?: ChestBreakageEffects;
  private readonly breakage: ChestBreakage;
  private impactTriggered = false;
  private impactAge = 0;
  private readonly impactCorner = new Vector3();
  private landing?: { advance(delta: number): void; cancel(error: unknown): void };

  constructor(baseUrl: string | URL, document: Document = globalThis.document, modelDefinition: ChestModelDefinition = ENDER_CASE.model, appearance: ChestAppearance = createChestAppearance(), onImpact?: () => void, breakage: ChestBreakage = NO_BREAKAGE) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.breakage = breakage;
    this.modelDefinition = modelDefinition;
    this.appearance = copyChestAppearance(appearance);
    this.onImpact = onImpact;
    this.document = document;
    if (!document.defaultView) throw new Error('The chest scene requires a browser window.');
    this.view = document.defaultView;
    this.entranceTimeline = new FrameTimeline(browserFrameEnvironment(this.view, document));
    this.element = document.createElement('div');
    this.element.className = 'chest-canvas';
  }

  setSoundMuted(muted: boolean): void { this.soundMuted = muted; this.effects?.setMuted(muted); }

  unlockAudio(): void { this.effects?.unlock(); }

  async stageForDrop(signal: AbortSignal): Promise<void> {
    this.assertPrepared(signal);
    if (this.mode !== 'preview') return;
    this.previewEntrance?.cancel(); this.previewEntrance = undefined;
    this.scheduler?.stop();
    this.detachAbort?.(); this.detachAbort = undefined;
    const visual = this.assets!.visual;
    const position = visual.position.clone(), rotation = visual.quaternion.clone();
    const scale = visual.scale.x;
    const reduced = this.view.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 0 : 2.2;
    this.fractureEffects?.start(reduced);
    let chargeStarted = false;
    await this.entranceTimeline.run(duration, elapsed => {
      const progress = duration ? Math.min(elapsed / 0.85, 1) : 1;
      const eased = progress * progress * (3 - 2 * progress);
      this.syncPose();
      visual.position.lerpVectors(position, visual.position.clone(), eased);
      visual.quaternion.slerpQuaternions(rotation, visual.quaternion.clone(), eased);
      visual.scale.setScalar(scale + (1 - scale) * eased);
      if (!reduced && elapsed > 0.85) {
        const charge = Math.min((elapsed - 0.85) / 1.35, 1);
        if (!chargeStarted) { this.effects?.charge(); chargeStarted = true; }
        const envelope = Math.sin(charge * Math.PI);
        visual.position.y += envelope * 0.16;
        visual.position.x += Math.sin(charge * 82) * envelope * 0.014;
        visual.position.z += Math.cos(charge * 69) * envelope * 0.01;
        this.fractureEffects?.charge(charge);
        this.impactEffects?.approach(visual.position.x, visual.position.y, visual.position.z, false);
      }
      this.render();
    }, signal);
  }

  subscribeErrors(listener: (error: unknown) => void): () => void {
    if (this.disposed) return () => {};
    this.errors.add(listener);
    return () => { this.errors.delete(listener); };
  }

  async prepare(signal: AbortSignal): Promise<void> {
    this.assertAlive(signal);
    if (this.prepared) return;
    this.release();
    const generation = this.generation;
    try {
      const renderer = new WebGLRenderer({ alpha: true, antialias: true });
      this.renderer = renderer;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFSoftShadowMap;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      renderer.localClippingEnabled = true; // geometric fracture fragments are clipped copies of the mesh
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      this.element.appendChild(renderer.domElement);
      const contextLost = (event: Event) => {
        event.preventDefault();
        if (generation !== this.generation || this.disposed) return;
        this.runtimeFailure(new Error('The WebGL context was lost.'));
      };
      renderer.domElement.addEventListener('webglcontextlost', contextLost);
      this.detachContextLost = () => renderer.domElement.removeEventListener('webglcontextlost', contextLost);

      await Promise.all([
        loadChestAssets(this.baseUrl, signal, this.modelDefinition, this.appearance).then(assets => {
          if (!this.isCurrent(generation, signal)) { assets.dispose(); signal.throwIfAborted(); throw new Error('Scene preparation was cancelled.'); }
          this.assets = assets;
        }),
        createRapierPhysicsWorld(signal).then(physics => {
          if (!this.isCurrent(generation, signal)) { physics.dispose(); signal.throwIfAborted(); throw new Error('Scene preparation was cancelled.'); }
          this.physics = physics;
        }),
      ]);
      this.assertAlive(signal);
      if (this.generation !== generation || !this.assets || !this.physics) throw new Error('Scene preparation was cancelled.');
      const scene = new Scene();
      this.scene = scene;
      scene.add(this.assets.visual);
      const effectColor = chestEffectColor(this.assets.appearance);
      this.fractureEffects = new ChestFractureEffects(this.assets.visual, effectColor, this.assets.appearance, this.modelDefinition.modifications);
      this.effects = new ChestOpeningEffects(this.assets.visual, effectColor);
      this.effects.setMuted(this.soundMuted);
      this.impactEffects = new ChestImpactEffects(scene, effectColor);
      this.breakageEffects = new ChestBreakageEffects(scene, this.assets.visual, this.modelDefinition.modifications,
        this.assets.appearance, this.breakage, '#' + effectColor.toString(16).padStart(6, '0'), 0);
      this.mixer = new AnimationMixer(this.assets.animationRoot);
      scene.add(new HemisphereLight(0xffffff, 0x435846, 2));
      const light = new DirectionalLight(0xffffff, 3);
      light.position.set(3, 6, -4);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.left = -5; light.shadow.camera.right = 5;
      light.shadow.camera.top = 5; light.shadow.camera.bottom = -5;
      light.shadow.camera.near = 0.1; light.shadow.camera.far = 20;
      scene.add(light);
      const floor = new Mesh(new PlaneGeometry(20, 20), new ShadowMaterial({ opacity: 0.25 }));
      this.floor = floor;
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
      const camera = new PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(-5, 3.5, -7);
      camera.lookAt(0, 1.1, 0);
      this.camera = camera;
      this.scheduler = new FrameScheduler(browserFrameEnvironment(this.view, this.document),
        delta => this.frame(delta), () => this.stepper.reset(), error => this.runtimeFailure(error));
      this.observer = new ResizeObserver(() => {
        if (generation !== this.generation || this.disposed) return;
        try { this.resize(); } catch (error) { this.runtimeFailure(error); }
      });
      this.observer.observe(this.element);
      this.prepared = true;
      this.resize();
    } catch (error) {
      if (this.generation === generation) this.release();
      throw error;
    }
  }

  async preview(signal: AbortSignal): Promise<void> {
    await this.reset(signal);
    this.assertPrepared(signal);
    this.mode = 'preview'; this.previewTime = 0;
    this.initialPose = false;
    this.assets!.visual.scale.setScalar(0.75);
    this.floor!.visible = false;
    this.syncPose();
    this.assets!.visual.position.y = 2.6;
    // Publish only the complete preview pose: reset's physical scale must never be visible.
    this.element.hidden = false; this.render();
    if (!this.view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.previewEntrance = this.element.animate([
        { transform: 'translateY(-65svh)' },
        { transform: 'translateY(0)' },
      ], { duration: 1300, easing: 'cubic-bezier(0.2, 0.7, 0.25, 1)', fill: 'backwards' });
    }
    const scheduler = this.scheduler!;
    const stop = () => scheduler.stop();
    signal.addEventListener('abort', stop, { once: true });
    this.detachAbort = () => signal.removeEventListener('abort', stop);
    if (!this.view.matchMedia('(prefers-reduced-motion: reduce)').matches) scheduler.start();
  }

  async drop(signal: AbortSignal): Promise<void> {
    this.assertPrepared(signal);
    if (!this.initialPose) await this.reset(signal);
    this.assertPrepared(signal);
    this.detachAbort?.();
    const scheduler = this.scheduler!;
    const stop = () => { scheduler.stop(); this.landing?.cancel(signal.reason); };
    signal.addEventListener('abort', stop, { once: true });
    this.detachAbort = () => signal.removeEventListener('abort', stop);
    this.initialPose = false;
    this.mode = 'drop';
    this.impactTriggered = false;
    this.impactAge = 0;
    this.fractureEffects?.start(this.view.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.breakageEffects?.start(this.view.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.element.hidden = false;
    await new Promise<void>((resolve, reject) => {
      let elapsed = 0;
      const cleanup = () => {
        this.landing = undefined; this.scheduler?.stop(); this.mode = 'stopped';
        this.detachAbort?.(); this.detachAbort = undefined;
      };
      this.landing = {
        advance: delta => {
          elapsed += delta;
          if (this.physics!.isChestSleeping()) { cleanup(); resolve(); }
          else if (elapsed > 15) { cleanup(); reject(new Error('The chest did not settle on the floor.')); }
        },
        cancel: error => { cleanup(); reject(error); },
      };
      this.scheduler!.start();
    });
  }

  open(signal: AbortSignal): Promise<void> {
    this.assertPrepared(signal);
    if (this.opening) return Promise.reject(new Error('The chest is already opening.'));
    this.scheduler!.stop();
    this.detachAbort?.(); this.detachAbort = undefined;
    this.mode = 'opening';
    this.effects?.start();
    this.element.hidden = false;
    const mixer = this.mixer!, assets = this.assets!;
    const clips = assets.animations;
    const actions = clips.map(clip => mixer.clipAction(clip));
    const reducedMotion = this.view.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clipDuration = Math.max(...clips.map(clip => clip.duration));
    const pending = new Set(actions);
    const start = assets.visual.position.clone();
    let elapsed = 0;
    if (assets.key) assets.key.visible = true;
    return new Promise<void>((resolve, reject) => {
      let complete = false;
      const finished = (event: { action: typeof actions[number] }) => { pending.delete(event.action); };
      const cleanup = () => {
        mixer.removeEventListener('finished', finished);
        signal.removeEventListener('abort', abort);
        this.opening = undefined;
        this.mode = 'stopped';
        this.scheduler?.stop();
      };
      const cancel = (error: unknown) => {
        if (complete) return;
        complete = true;
        cleanup();
        mixer.stopAllAction();
        this.effects?.stop();
        reject(error);
      };
      const abort = () => cancel(signal.reason);
      this.opening = {
        cancel,
        advance: delta => {
          if (reducedMotion) delta = Math.max(delta, clipDuration + 0.3);
          elapsed += delta;
          // Original 25-frame movement expressed in seconds; physics no longer owns the visual pose.
          const progress = Math.min(elapsed / (25 / 60), 1);
          const eased = 1 - (1 - progress) ** 3;
          assets.visual.position.copy(start);
          assets.visual.position.y -= 0.7 * eased;
          assets.visual.scale.setScalar(1 + 0.25 * eased);
          mixer.update(delta);
          this.effects?.update(elapsed / (clipDuration + 0.3), reducedMotion);
          this.fractureEffects?.update(delta, false);
          // After the pose: the energy build-up swells and shakes the chest on top of it.
          this.breakageEffects?.update(delta, elapsed / (clipDuration + 0.3));
          this.render();
          // A destroyed chest has nothing left to open: end shortly after the burst settles.
          const wrecked = this.breakage.destroyed && this.breakageEffects?.broken === true
            && elapsed >= BURST_AT * (clipDuration + 0.3) + 1.8;
          if (wrecked || pending.size === 0 && progress === 1 && elapsed >= clipDuration + 0.3) {
            complete = true;
            cleanup();
            resolve();
          }
        },
      };
      mixer.addEventListener('finished', finished);
      signal.addEventListener('abort', abort, { once: true });
      try {
        for (const action of actions) {
          action.reset().setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.play();
        }
        this.scheduler!.start();
      } catch (error) { cancel(error); }
    });
  }

  hide(): void {
    this.impactEffects?.reset();
    this.fractureEffects?.reset();
    this.entranceTimeline.cancel();
    this.previewEntrance?.cancel(); this.previewEntrance = undefined;
    this.effects?.stop();
    this.impactEffects?.reset();
    this.fractureEffects?.reset();
    this.landing?.cancel(new Error('The chest was hidden during its fall.'));
    this.opening?.cancel(new Error('The chest was hidden before opening finished.'));
    this.scheduler?.stop();
    this.mode = 'stopped';
    this.element.hidden = true;
  }

  async reset(signal: AbortSignal): Promise<void> {
    this.assertPrepared(signal);
    this.entranceTimeline.cancel();
    this.previewEntrance?.cancel(); this.previewEntrance = undefined;
    this.element.hidden = true;
    this.effects?.stop();
    this.impactEffects?.reset();
    this.fractureEffects?.reset();
    this.landing?.cancel(new Error('The chest fall was reset.'));
    this.opening?.cancel(new Error('The chest opening was reset.'));
    this.scheduler!.stop();
    this.detachAbort?.();
    this.detachAbort = undefined;
    this.mode = 'stopped';
    this.mixer!.stopAllAction();
    this.breakageEffects?.reset();
    this.floor!.visible = true;
    this.mixer!.setTime(0);
    this.assets!.restore();
    this.physics!.resetChest(this.assets!.colliders, SPAWN_POSE);
    this.initialPose = true;
    this.syncPose();
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.errors.clear();
    this.entranceTimeline.dispose();
    this.release();
    this.element.remove();
  }

  private frame(deltaSeconds: number): void {
    this.assets?.modifications.update(Math.min(deltaSeconds, 0.1));
    if (!this.element.isConnected) { this.stepper.reset(); return; }
    if (this.mode === 'preview') {
      this.previewTime += Math.min(deltaSeconds, 0.1);
      this.syncPose();
      this.assets!.visual.position.y = 2.6;
      this.assets!.visual.scale.setScalar(0.75);
      this.render(); return;
    }
    if (this.mode === 'opening') { this.opening?.advance(Math.min(deltaSeconds, 0.1)); return; }
    if (this.mode !== 'drop') return;
    let simulated = 0;
    this.stepper.advance(deltaSeconds, step => { this.physics!.step(step); simulated += step; });
    this.syncPose();
    if (!this.impactTriggered) {
      const visual = this.assets!.visual;
      let lowest = Infinity;
      for (const box of this.assets!.colliders) {
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
          this.impactCorner.set(box.center.x + x * box.halfExtents.x,
            box.center.y + y * box.halfExtents.y, box.center.z + z * box.halfExtents.z);
          this.impactCorner.applyQuaternion(visual.quaternion).add(visual.position);
          lowest = Math.min(lowest, this.impactCorner.y);
        }
      }
      this.impactEffects?.approach(visual.position.x, visual.position.y, visual.position.z,
        this.view.matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (lowest < 0.06) {
        this.impactTriggered = true;
        this.impactAge = 0;
        this.impactEffects?.trigger(visual.position.x, visual.position.z,
          this.view.matchMedia('(prefers-reduced-motion: reduce)').matches);
        this.effects?.impact();
        // Cracks open on landing only when the decided fate breaks the chest there.
        if (this.breakageEffects?.breaksOnImpact) this.fractureEffects?.impact();
        this.breakageEffects?.impact();
        this.onImpact?.();
      }
    }
    this.impactEffects?.update(simulated);
    this.fractureEffects?.update(simulated, !this.impactTriggered);
    this.breakageEffects?.update(simulated);
    if (this.impactTriggered && !this.view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.impactAge += simulated;
      const t = this.impactAge;
      const squash = Math.exp(-t * 11) * Math.sin(Math.min(t / 0.24, 1) * Math.PI) * 0.14;
      this.assets!.visual.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      this.assets!.visual.position.y -= squash * 0.8;
    }
    this.render();
    this.landing?.advance(simulated);
  }

  private syncPose(): void {
    const pose = this.physics!.readChestPose();
    this.assets!.visual.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.assets!.visual.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  }

  private resize(): void {
    if (!this.renderer || !this.camera) return;
    const { width, height } = this.element.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(this.view.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    // Intro shows the upper slice of the same full-screen camera, not a zoomed viewport.
    const fullHeight = Math.max(height, this.view.innerHeight);
    this.camera.aspect = width / fullHeight;
    this.camera.setViewOffset(width, fullHeight, 0, 0, width, height);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render(): void {
    if (this.renderer && this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  private runtimeFailure(error: unknown): void {
    if (this.disposed) return;
    try { this.release(); } catch (cleanupError) { error = new AggregateError([error, cleanupError], 'Scene failure and cleanup error.'); }
    for (const listener of [...this.errors]) listener(error);
  }

  private release(): void {
    this.entranceTimeline.cancel();
    this.previewEntrance?.cancel(); this.previewEntrance = undefined;
    this.landing?.cancel(new Error('The chest scene was released.'));
    this.opening?.cancel(new Error('The chest scene was released.'));
    this.mode = 'stopped';
    if (this.mixer && this.assets) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.assets.animationRoot);
    }
    this.mixer = undefined;
    this.generation += 1;
    this.prepared = false;
    this.initialPose = false;
    this.detachAbort?.(); this.detachAbort = undefined;
    this.detachContextLost?.(); this.detachContextLost = undefined;
    this.scheduler?.dispose(); this.scheduler = undefined;
    this.observer?.disconnect(); this.observer = undefined;
    this.fractureEffects?.dispose(); this.fractureEffects = undefined;
    this.breakageEffects?.dispose(); this.breakageEffects = undefined;
    this.impactEffects?.dispose(); this.impactEffects = undefined;
    this.effects?.dispose(); this.effects = undefined;
    const physics = this.physics, assets = this.assets, scene = this.scene, renderer = this.renderer;
    this.physics = undefined; this.assets = undefined;
    this.scene = undefined; this.renderer = undefined; this.camera = undefined; this.floor = undefined;
    assets?.visual.removeFromParent();
    const errors: unknown[] = [];
    for (const clean of [() => physics?.dispose(), () => assets?.dispose(),
      () => { if (scene) disposeObject(scene); },
      () => { if (renderer) { renderer.dispose(); renderer.forceContextLoss(); } }]) {
      try { clean(); } catch (error) { errors.push(error); }
    }
    this.element.replaceChildren();
    this.stepper.reset();
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to release scene resources.');
  }

  private assertAlive(signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.disposed) throw new Error('The chest scene has been disposed.');
  }

  private assertPrepared(signal: AbortSignal): void {
    this.assertAlive(signal);
    if (!this.prepared) throw new Error('The chest scene is not prepared.');
  }

  private isCurrent(generation: number, signal: AbortSignal): boolean {
    return !this.disposed && !signal.aborted && this.generation === generation;
  }
}
