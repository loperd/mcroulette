import RAPIER, { type RigidBody, type World } from '@dimforge/rapier3d-compat';
import { AdditiveBlending, Box3, BoxGeometry, Color, DataTexture, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NearestFilter, PlaneGeometry, PointLight, Quaternion, RepeatWrapping, RGBAFormat, RingGeometry, ShaderMaterial, SRGBColorSpace, Vector3,
  type BufferGeometry, type Material, type Object3D } from 'three';
import type { BreakMoment, BreakPattern, ChestBreakage } from '../../../domain/chest-breakage.ts';
import { resolveModifications, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import { defaultDebris, type ChestModificationProfile, type DebrisStyle } from '../../../domain/chest-modifications.ts';
import { meshesOf } from './chest-appearance.ts';
import { buildFragment, fractureCells } from './chest-fracture-geometry.ts';
import { fracturePattern, PATTERN_SIZE, random, wearPattern } from './chest-surface-patterns.ts';
import type { ResolvedModification } from '../../../domain/chest-appearance.ts';

/**
 * Opening timeline (0..1 of its duration): from CHARGE_AT the energy builds up (glow, swelling,
 * trembling, first chips); at BURST_AT the chest gives way.
 */
export const CHARGE_AT = .06, BURST_AT = .22;

/** Chunks per pattern: base + severity × extra. `fall` keeps the part whole. */
const CHUNKS: Record<BreakPattern, [number, number]> = { shatter: [5, 4], split: [2, 1], crumble: [4, 3], fall: [1, 0] };
/** Stone and planks snap close to their axes; shatter tilts a little more. */
const JITTER: Record<BreakPattern, number> = { shatter: .3, split: .15, crumble: .2, fall: 0 };
const STONE_DENSITY = 2.4;
const STEP = 1 / 120;

/** Light debris that flutters or fades instead of tumbling as a rigid body. */
interface Particle {
  readonly mesh: Mesh; readonly velocity: Vector3; readonly spin: Vector3; readonly shape: DebrisStyle['shape'];
  readonly size: number; age: number; readonly life: number;
}
/** A rigid piece: a solid fracture chunk, a whole fallen part or a heavy chip. */
interface Body { readonly object: Object3D; readonly offset: Matrix4; readonly body: RigidBody; delay: number; readonly launch: () => void }
interface PartSource {
  readonly meshes: Mesh[]; readonly severity: number; readonly detached: boolean; readonly pattern: BreakPattern;
  readonly debris: { style: DebrisStyle; weight: number }[];
  readonly breakMaterial: MeshStandardMaterial;
  /** Damage already on the part (rust, cracks, wear): where it will give way. */
  readonly damage: readonly ResolvedModification[];
}

const LIGHT: Record<'leaf' | 'spark' | 'puff', { scale: number; gravity: number; drag: number; life: number }> = {
  leaf: { scale: 1.4, gravity: 2.5, drag: 2.2, life: 2.8 },
  spark: { scale: .55, gravity: 1.5, drag: 1.5, life: .9 },
  puff: { scale: 2.6, gravity: -.5, drag: 3, life: 1.3 },
};
const RIGID_SCALE: Record<'chip' | 'shard' | 'flake', [number, number, number]> = { chip: [1, 1, 1], shard: [.55, 1.8, .55], flake: [1.1, .3, 1.1] };

/**
 * Draws the server-decided breakage with real rigid-body physics (Rapier). Two stories:
 *   impact  — mechanical: the hit breaks the chest, heavy chunks slump and settle where it landed;
 *   opening — energy overload: the chest swells, trembles and glows, then bursts with a flash and a
 *             floor shockwave that throws the chunks outwards.
 * Fragments are solid convex chunks cut from the real mesh (chest texture outside, broken stone
 * inside), computed from the seed: no two breaks alike. They collide with the floor, each other and
 * whatever is still standing, then come to rest on a face. Light debris follows the part's
 * modifications: rust flakes, moss leaves, ice, rune sparks.
 *
 * Requires RAPIER.init() to have completed (the chest scene does so before creating this).
 */
export class ChestBreakageEffects {
  private readonly sources: PartSource[] = [];
  /** Parts outside the breakage: they ride on the carrier and fall when it is destroyed. */
  private readonly riders: Mesh[][] = [];
  private readonly carrierDetached: boolean;
  private readonly allMeshes: Mesh[];
  private readonly particles: Particle[] = [];
  private readonly bodies: Body[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly shared = new Map<string, BufferGeometry | MeshStandardMaterial>();
  private readonly owned: Material[] = [];
  private readonly world: Object3D;
  private readonly chest: Object3D;
  private readonly floorY: number;
  private readonly seed: number;
  private next: () => number;
  private readonly moment: BreakMoment;
  private readonly accent: Color;
  private readonly flash = new PointLight(0xffffff, 0, 8, 2);
  private physics?: World;
  private accumulator = 0;
  private ring?: Mesh;
  private ringAge = Infinity;
  private flashAge = Infinity;
  private charged = false;
  private burst = false;
  private reduced = false;

  constructor(world: Object3D, chest: Object3D, profile: ChestModificationProfile, appearance: ChestAppearance,
    breakage: ChestBreakage, accent: string, floorY: number) {
    this.world = world; this.chest = chest; this.floorY = floorY;
    this.seed = breakage.seed; this.next = random(breakage.seed);
    this.moment = breakage.moment;
    this.accent = new Color(accent);
    this.flash.color.copy(this.accent);
    const parts = new Map(profile.parts.map(part => [part.id, part.nodes]));
    this.allMeshes = profile.parts.flatMap(part => meshesOf(chest, part.nodes));
    const resolved = resolveModifications(appearance, profile);
    for (const item of breakage.parts) {
      const meshes = meshesOf(chest, parts.get(item.part) ?? []);
      if (!meshes.length || (item.severity === 0 && !item.detached)) continue;
      const stone = averageColor(meshes[0]!);
      const debris = [{ style: { shape: 'chip', color: '#' + stone.getHexString(), share: 1 } as DebrisStyle, weight: 1 },
        ...resolved.filter(mod => mod.definition.parts.includes(item.part))
          .map(mod => { const style = defaultDebris(mod.definition, accent); return { style, weight: style.share * mod.intensity }; })];
      const damage = resolved.filter(mod => mod.definition.parts.includes(item.part) && (mod.definition.kind === 'wear' || mod.definition.kind === 'fracture'));
      this.sources.push({ meshes, severity: item.severity, detached: item.detached, pattern: item.pattern, debris,
        breakMaterial: this.breakMaterial(stone, item.part), damage });
    }
    const carrier = profile.parts[0]?.id;
    this.carrierDetached = breakage.parts.some(item => item.part === carrier && item.detached);
    if (this.carrierDetached) {
      for (const part of profile.parts.slice(1)) {
        if (breakage.parts.some(item => item.part === part.id && item.detached)) continue;
        const meshes = meshesOf(chest, part.nodes);
        if (meshes.length) this.riders.push(meshes);
      }
    }
  }

  get active(): boolean { return this.sources.length > 0; }
  get breaksOnImpact(): boolean { return this.active && this.moment === 'impact'; }
  /** True once the break has happened. */
  get broken(): boolean { return this.burst; }

  start(reduced: boolean): void { this.reset(); this.reduced = reduced; }

  /** The hard landing: mechanical damage where the chest hit. */
  impact(): void {
    if (!this.breaksOnImpact || this.burst) return;
    this.charged = this.burst = true;
    this.detach('impact');
    for (const source of this.sources) this.chips(source, Math.round(source.severity * 10), 'impact');
    this.dust(8);
  }

  /**
   * Opening: progress 0..1 of its duration, delta in seconds. Call after the scene has posed the
   * chest for this frame: the energy build-up adds its swell and tremble on top.
   */
  update(delta: number, progress = 0): void {
    if (this.moment === 'opening' && this.active && !this.burst && progress >= CHARGE_AT) {
      if (!this.charged) { this.charged = true; for (const source of this.sources) this.chips(source, Math.round(source.severity * 5), 'opening'); }
      const charge = Math.min(1, (progress - CHARGE_AT) / (BURST_AT - CHARGE_AT)), strength = this.strength();
      if (!this.reduced) {
        // The chest strains against the power inside: swelling, then a tremble that grows.
        this.chest.scale.multiplyScalar(1 + charge ** 2 * .05 * strength);
        this.chest.position.x += (this.next() - .5) * charge ** 2 * .035 * strength;
        this.chest.position.z += (this.next() - .5) * charge ** 2 * .035 * strength;
      }
      this.glow(charge ** 1.5 * 7 * strength);
      if (progress >= BURST_AT) {
        this.burst = true;
        this.detach('opening');
        for (const source of this.sources) this.chips(source, Math.round(source.severity * 10), 'opening');
        if (!this.reduced) { this.shockwave(); this.dust(6); }
        this.flashAge = 0;
      }
    }
    const step = Math.min(delta, .05);
    this.animateEnergy(step);
    this.stepPhysics(step);
    this.simulateParticles(step);
  }

  reset(): void {
    this.charged = this.burst = false;
    this.next = random(this.seed); // a replayed session breaks the same way
    this.flash.intensity = 0; this.flash.removeFromParent(); this.flashAge = this.ringAge = Infinity; this.ring?.removeFromParent();
    for (const source of this.sources) for (const mesh of source.meshes) mesh.visible = true;
    for (const meshes of this.riders) for (const mesh of meshes) mesh.visible = true;
    for (const particle of this.particles) particle.mesh.removeFromParent();
    for (const body of this.bodies) body.object.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.particles.length = this.bodies.length = this.geometries.length = 0;
    for (const material of this.owned) material.dispose();
    this.owned.length = 0;
    this.physics?.free(); this.physics = undefined; this.accumulator = 0;
  }

  dispose(): void {
    this.reset();
    for (const item of this.shared.values()) item.dispose();
    for (const source of this.sources) { source.breakMaterial.map?.dispose(); source.breakMaterial.dispose(); }
    (this.ring?.material as Material | undefined)?.dispose(); this.ring?.geometry.dispose();
    this.shared.clear(); this.sources.length = 0;
    this.flash.dispose();
  }

  private strength() {
    const detached = this.sources.filter(source => source.detached).length;
    return .5 + Math.min(1, detached / Math.max(1, this.sources.length)) * .8;
  }

  private requirePhysics(): World {
    if (this.physics) return this.physics;
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, this.floorY - .5, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, .5, 20).setFriction(.9).setRestitution(.05), floor);
    this.physics = world;
    return world;
  }

  /** Whatever still stands becomes a static obstacle: a fallen lid lands on the body. */
  private addObstacles(world: World, gone: Set<Mesh>) {
    for (const mesh of this.allMeshes) {
      if (gone.has(mesh) || !mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      const box = new Box3().setFromObject(mesh), centre = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(.5);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centre.x, centre.y, centre.z));
      world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setFriction(.8), body);
    }
  }

  private detach(moment: BreakMoment) {
    this.chest.updateWorldMatrix(true, true);
    const core = new Box3().setFromObject(this.chest).getCenter(new Vector3());
    const detached = this.sources.filter(source => source.detached);
    const gone = new Set<Mesh>([...detached.flatMap(source => source.meshes), ...(this.carrierDetached ? this.riders.flat() : [])]);
    if (!this.reduced && gone.size) {
      const world = this.requirePhysics();
      this.addObstacles(world, gone);
      for (const source of detached) {
        const [base, extra] = CHUNKS[source.pattern];
        for (const mesh of source.meshes) this.fracture(world, mesh, source, moment, base + Math.round(source.severity * extra), core);
      }
      // Nothing holds the lid and latch up any more: they drop as they are.
      for (const meshes of this.riders) for (const mesh of meshes) this.whole(world, mesh, 'impact', core);
    }
    for (const mesh of gone) mesh.visible = false;
  }

  /** Solid chunks of the real mesh; `fall` keeps the part whole with its modifications. */
  private fracture(world: World, mesh: Mesh, source: PartSource, moment: BreakMoment, count: number, core: Vector3) {
    if (source.pattern === 'fall') { this.whole(world, mesh, moment, core); return; }
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const texel = new Box3().setFromObject(mesh).getSize(new Vector3()).x / 16;
    const outer = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)!;
    const height = box.max.y - box.min.y || 1;
    // A damaged part has more pieces: rust and cracks weaken it.
    const weak = weakPoints(mesh, source.damage, this.next);
    const pieces = count + (weak.length ? 1 + Math.round(Math.max(...source.damage.map(item => item.intensity)) * 2) : 0);
    for (const cell of fractureCells(box, pieces, this.next, JITTER[source.pattern], source.pattern === 'crumble' ? .2 : .6, weak)) {
      const fragment = buildFragment(mesh.geometry, cell, mesh.matrixWorld, texel);
      if (!fragment || fragment.volume < 1e-7) continue;
      this.geometries.push(fragment.geometry);
      const object = new Mesh(fragment.geometry, [outer, source.breakMaterial]);
      object.castShadow = object.receiveShadow = true; object.userData.chestOverlay = true; object.matrixAutoUpdate = false;
      this.carryOverlays(mesh, object);
      this.world.add(object);
      const away = fragment.centre.clone().sub(core);
      const delay = source.pattern === 'crumble' ? (1 - (cell.centre.y - box.min.y) / height) * .5 + this.next() * .2 : 0;
      this.addBody(world, object, new Matrix4(), fragment.centre, new Quaternion(), RAPIER.ColliderDesc.convexHull(fragment.hull),
        fragment.volume * STONE_DENSITY, away, source.pattern, moment, delay);
    }
  }

  /**
   * Surface overlays of the part (rust, moss, cracks…) continue on the outer faces of its chunks:
   * the same shader, fed with the chunk's mesh-space source coordinates instead of its own.
   */
  private carryOverlays(mesh: Mesh, fragment: Mesh) {
    const hidden = this.shared.get('hidden') as MeshStandardMaterial | undefined
      ?? (() => { const material = new MeshStandardMaterial({ visible: false }); this.shared.set('hidden', material); return material; })();
    for (const child of mesh.children) {
      if (!(child instanceof Mesh) || !child.userData.chestOverlay || !child.visible || !(child.material instanceof ShaderMaterial)) continue;
      if (!child.material.vertexShader.includes('vLocal = position')) continue;
      const material = child.material.clone();
      material.uniforms = child.material.uniforms; // shared: pulses and reveal keep animating
      material.vertexShader = 'attribute vec3 sourcePosition; attribute vec3 sourceNormal;\n'
        + material.vertexShader.replace('vLocal = position; vLocalNormal = normal;', 'vLocal = sourcePosition; vLocalNormal = sourceNormal;');
      this.owned.push(material);
      const overlay = new Mesh(fragment.geometry, [material, hidden]);
      overlay.renderOrder = child.renderOrder; overlay.userData.chestOverlay = true;
      fragment.add(overlay);
    }
  }

  /** A part coming off in one piece: a clone (overlays included) on a box collider. */
  private whole(world: World, mesh: Mesh, moment: BreakMoment, core: Vector3) {
    mesh.updateWorldMatrix(true, false);
    const box = new Box3().setFromObject(mesh), centre = box.getCenter(new Vector3()), half = box.getSize(new Vector3()).multiplyScalar(.5);
    const object = mesh.clone(true);
    object.visible = true; object.matrixAutoUpdate = false; object.userData.chestOverlay = true; object.castShadow = true;
    this.world.add(object);
    // Body frame at the box centre; the clone keeps its exact world pose relative to it.
    const offset = new Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z).multiply(mesh.matrixWorld);
    this.addBody(world, object, offset, centre, new Quaternion(), RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z),
      half.x * half.y * half.z * 8 * STONE_DENSITY, centre.clone().sub(core), 'fall', moment, 0);
  }

  private addBody(world: World, object: Object3D, offset: Matrix4, at: Vector3, rotation: Quaternion,
    collider: RAPIER.ColliderDesc | null, mass: number, away: Vector3, pattern: BreakPattern, moment: BreakMoment, delay: number) {
    if (!collider) { object.removeFromParent(); return; }
    const body = world.createRigidBody((delay > 0 ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(at.x, at.y, at.z).setRotation(rotation).setLinearDamping(.08).setAngularDamping(.35).setCcdEnabled(true));
    world.createCollider(collider.setDensity(STONE_DENSITY).setFriction(.85).setRestitution(.08), body);
    const direction = away.lengthSq() < 1e-6 ? new Vector3(this.next() - .5, 0, this.next() - .5) : away.clone();
    direction.normalize();
    const r = () => this.next();
    const launch = () => {
      if (body.bodyType() !== RAPIER.RigidBodyType.Dynamic) body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      let velocity: Vector3;
      if (moment === 'opening') {
        // Energy from the core: speed by pattern, a lift so chunks arc instead of skating.
        // Heavy stone: a burst throws chunks a body-length or two, not across the room.
        const speed = { shatter: 1.8 + r() * 1.2, split: 1.2 + r() * .8, crumble: .5 + r() * .4, fall: .8 + r() * .6 }[pattern];
        const lift = { shatter: 1.6 + r() * .9, split: 1.8 + r() * .7, crumble: .3, fall: 3 + r() * .8 }[pattern];
        velocity = direction.clone().multiplyScalar(speed).setY(Math.max(direction.y * speed, 0) + lift);
      } else {
        // The hit: pieces give way outwards; gravity does the rest.
        velocity = direction.clone().setY(0).normalize().multiplyScalar({ shatter: .9, split: .5, crumble: .25, fall: .6 }[pattern] * (.6 + r() * .6)).setY(r() * .4);
      }
      const total = Math.max(mass, 1e-4);
      body.applyImpulse({ x: velocity.x * total, y: velocity.y * total, z: velocity.z * total }, true);
      const twist = (moment === 'opening' ? .06 : .025) * total;
      body.applyTorqueImpulse({ x: (r() - .5) * twist, y: (r() - .5) * twist, z: (r() - .5) * twist }, true);
    };
    if (delay <= 0) launch();
    const entry = { object, offset, body, delay, launch };
    this.bodies.push(entry);
    this.sync(entry);
  }

  private stepPhysics(delta: number) {
    if (!this.physics) return;
    for (const body of this.bodies) if (body.delay > 0 && (body.delay -= delta) <= 0) body.launch();
    this.accumulator += delta;
    while (this.accumulator >= STEP) { this.physics.timestep = STEP; this.physics.step(); this.accumulator -= STEP; }
    for (const body of this.bodies) this.sync(body);
  }

  private sync({ object, offset, body }: Body) {
    const t = body.translation(), q = body.rotation();
    object.matrix.compose(new Vector3(t.x, t.y, t.z), new Quaternion(q.x, q.y, q.z, q.w), new Vector3(1, 1, 1)).multiply(offset);
    object.matrixWorldNeedsUpdate = true;
  }

  /** Small debris from the surface: stone grit plus whatever the modifications are made of. */
  private chips(source: PartSource, count: number, moment: BreakMoment) {
    if (this.reduced || count <= 0) return;
    this.chest.updateWorldMatrix(true, true);
    const core = new Box3().setFromObject(this.chest).getCenter(new Vector3());
    const total = source.debris.reduce((sum, item) => sum + item.weight, 0);
    for (let index = 0; index < count; index++) {
      const mesh = source.meshes[Math.floor(this.next() * source.meshes.length)]!;
      const box = new Box3().setFromObject(mesh), size = box.getSize(new Vector3());
      const unit = Math.max(size.x, size.z) / 16; // one model texel
      let pick = this.next() * total, debris = source.debris[0]!.style;
      for (const item of source.debris) { pick -= item.weight; if (pick <= 0) { debris = item.style; break; } }
      const point = surfacePoint(box, size, this.next);
      const edge = unit * (1 + Math.floor(this.next() * 2));
      const away = point.clone().sub(core).normalize();
      if (debris.shape === 'chip' || debris.shape === 'shard' || debris.shape === 'flake') {
        const scale = RIGID_SCALE[debris.shape];
        const object = new Mesh(this.box(), this.material(debris));
        object.castShadow = true; object.userData.chestOverlay = true; object.matrixAutoUpdate = false;
        this.world.add(object);
        const half = { x: edge * scale[0] / 2, y: edge * scale[1] / 2, z: edge * scale[2] / 2 };
        const offset = new Matrix4().makeScale(edge * scale[0], edge * scale[1], edge * scale[2]);
        const tilt = new Quaternion().setFromAxisAngle(new Vector3(this.next(), this.next(), this.next()).normalize(), this.next() * 6);
        this.addBody(this.requirePhysics(), object, offset, point, tilt, RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z),
          half.x * half.y * half.z * 8 * STONE_DENSITY, away, 'shatter', moment, 0);
      } else {
        const light = LIGHT[debris.shape];
        const object = new Mesh(debris.shape === 'leaf' ? this.plane() : this.box(), this.material(debris));
        object.scale.setScalar(edge * light.scale);
        object.position.copy(point); object.userData.chestOverlay = true;
        this.world.add(object);
        const velocity = away.multiplyScalar((moment === 'opening' ? 1.6 : .7) * (.6 + this.next())).add(new Vector3(0, .8, 0));
        this.particles.push({ mesh: object, velocity, spin: new Vector3(this.next() - .5, this.next() - .5, this.next() - .5).multiplyScalar(8),
          shape: debris.shape, size: edge * light.scale, age: 0, life: light.life * (.75 + this.next() * .5) });
      }
    }
  }

  private simulateParticles(delta: number) {
    for (let index = this.particles.length - 1; index >= 0; index--) {
      const particle = this.particles[index]!, light = LIGHT[particle.shape as keyof typeof LIGHT];
      particle.age += delta;
      particle.velocity.y -= light.gravity * delta;
      particle.velocity.multiplyScalar(Math.max(0, 1 - light.drag * delta));
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += particle.spin.x * delta; particle.mesh.rotation.y += particle.spin.y * delta;
      if (particle.mesh.position.y < this.floorY + particle.size * .3) {
        particle.mesh.position.y = this.floorY + particle.size * .3; particle.velocity.multiplyScalar(.3); particle.spin.multiplyScalar(.3);
      }
      const remaining = particle.life - particle.age;
      if (particle.shape === 'puff') {
        particle.mesh.scale.multiplyScalar(1 + delta * .8);
        (particle.mesh.material as MeshStandardMaterial).opacity = Math.max(0, .2 * remaining / particle.life);
      } else if (remaining < .4) particle.mesh.scale.multiplyScalar(Math.max(.01, 1 - delta / Math.max(remaining, .02)));
      if (remaining <= 0) { particle.mesh.removeFromParent(); this.particles.splice(index, 1); }
    }
  }

  private glow(intensity: number) {
    if (!this.flash.parent) this.world.add(this.flash);
    this.chest.updateWorldMatrix(true, false);
    new Box3().setFromObject(this.chest).getCenter(this.flash.position);
    this.flash.intensity = this.reduced ? 0 : intensity;
  }

  /** Energy release: a bright flash at the core and a ring running along the floor. */
  private shockwave() {
    this.chest.updateWorldMatrix(true, false);
    const centre = new Box3().setFromObject(this.chest).getCenter(new Vector3());
    if (!this.ring) {
      this.ring = new Mesh(new RingGeometry(.9, 1, 64), new MeshBasicMaterial({ color: this.accent, transparent: true, opacity: .7,
        blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.userData.chestOverlay = true;
    }
    this.ring.position.set(centre.x, this.floorY + .01, centre.z);
    this.world.add(this.ring);
    this.ringAge = 0;
  }

  private animateEnergy(delta: number) {
    if (Number.isFinite(this.flashAge)) {
      this.flashAge += delta;
      this.flash.intensity = this.reduced ? 0 : 55 * Math.exp(-this.flashAge * 5);
      if (this.flashAge > 1.2) { this.flashAge = Infinity; this.flash.intensity = 0; }
    }
    if (this.ring && Number.isFinite(this.ringAge)) {
      this.ringAge += delta;
      this.ring.scale.setScalar(.2 + this.ringAge * 5);
      (this.ring.material as MeshBasicMaterial).opacity = Math.max(0, .7 * (1 - this.ringAge / .7));
      if (this.ringAge > .7) { this.ringAge = Infinity; this.ring.removeFromParent(); }
    }
  }

  /** Soft dust rolling out along the floor. */
  private dust(count: number) {
    if (this.reduced) return;
    this.chest.updateWorldMatrix(true, false);
    const box = new Box3().setFromObject(this.chest), size = box.getSize(new Vector3());
    const unit = Math.max(size.x, size.z) / 16;
    for (let index = 0; index < count; index++) {
      const object = new Mesh(this.box(), this.material({ shape: 'puff', color: '#7d8584', share: 1 }));
      const angle = this.next() * Math.PI * 2;
      object.position.set(box.min.x + size.x * this.next(), this.floorY + unit * 1.5, box.min.z + size.z * this.next());
      object.scale.setScalar(unit * 2);
      object.userData.chestOverlay = true;
      this.world.add(object);
      this.particles.push({ mesh: object, velocity: new Vector3(Math.cos(angle), .2, Math.sin(angle)).multiplyScalar(1.2),
        spin: new Vector3(), shape: 'puff', size: unit * 3, age: 0, life: 1.3 + this.next() * .6 });
    }
  }

  /** Broken stone: the part's own colour, darker and grainy, on the chest's texel grid. */
  private breakMaterial(stone: Color, seed: string): MeshStandardMaterial {
    const next = random(hash(seed) ^ this.seed), size = 16, pixels = new Uint8Array(size * size * 4);
    const base = stone.clone().multiplyScalar(.55);
    for (let index = 0; index < size * size; index++) {
      const shade = .55 + next() * .55 + (next() < .08 ? .35 : 0);
      const color = base.clone().multiplyScalar(shade).convertLinearToSRGB();
      pixels[index * 4] = Math.min(255, color.r * 255); pixels[index * 4 + 1] = Math.min(255, color.g * 255);
      pixels[index * 4 + 2] = Math.min(255, color.b * 255); pixels[index * 4 + 3] = 255;
    }
    const map = new DataTexture(pixels, size, size, RGBAFormat);
    map.magFilter = map.minFilter = NearestFilter; map.wrapS = map.wrapT = RepeatWrapping; map.colorSpace = SRGBColorSpace; map.needsUpdate = true;
    return new MeshStandardMaterial({ map, roughness: .95, flatShading: true });
  }

  private box() {
    let geometry = this.shared.get('box') as BufferGeometry | undefined;
    if (!geometry) { geometry = new BoxGeometry(1, 1, 1); this.shared.set('box', geometry); }
    return geometry;
  }
  private plane() {
    let geometry = this.shared.get('plane') as BufferGeometry | undefined;
    if (!geometry) { geometry = new PlaneGeometry(1, 1); this.shared.set('plane', geometry); }
    return geometry;
  }

  private material(debris: DebrisStyle) {
    if (debris.shape === 'puff') {
      // Puffs fade individually, so each gets its own material.
      const material = new MeshStandardMaterial({ color: debris.color, transparent: true, opacity: .32, depthWrite: false, roughness: 1 });
      this.owned.push(material);
      return material;
    }
    const key = `${debris.shape}:${debris.color}`;
    let material = this.shared.get(key) as MeshStandardMaterial | undefined;
    if (!material) {
      const glowing = debris.shape === 'spark' || debris.shape === 'shard' && new Color(debris.color).getHSL({ h: 0, s: 0, l: 0 }).s > .3;
      material = new MeshStandardMaterial({ color: debris.color, roughness: .85, side: debris.shape === 'leaf' ? DoubleSide : undefined,
        emissive: glowing ? debris.color : '#000000', emissiveIntensity: debris.shape === 'spark' ? 1.6 : .35 });
      this.shared.set(key, material);
    }
    return material;
  }
}

/**
 * Points on the part's surface where its damage is: the same masks and projection the overlays use
 * (chest-modification-layers.ts), so the break follows the rust or cracks the player can see.
 */
function weakPoints(mesh: Mesh, damage: readonly ResolvedModification[], next: () => number): Vector3[] {
  if (!damage.length) return [];
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!, size = box.getSize(new Vector3());
  const masks = damage.map(item => ({ item, pixels: item.definition.kind === 'wear'
    ? wearPattern(item.definition.style, item.seed)
    : item.definition.kind === 'fracture' ? fracturePattern(item.definition.style, item.seed) : undefined }));
  const result: Vector3[] = [];
  for (let attempt = 0; attempt < 600 && result.length < 24; attempt++) {
    const point = surfacePoint(box, size, next);
    const axis = [point.x === box.min.x || point.x === box.max.x, point.y === box.max.y, true].indexOf(true);
    const [u, v] = axis === 0 ? [point.z, point.y] : axis === 1 ? [point.x, point.z] : [point.x, point.y];
    for (const { item, pixels } of masks) {
      if (!pixels) continue;
      const scale = item.definition.style.scale * .5;
      const x = Math.floor(((u * scale % 1) + 1) % 1 * PATTERN_SIZE), y = Math.floor(((v * scale % 1) + 1) % 1 * PATTERN_SIZE);
      const index = (y * PATTERN_SIZE + x) * 4;
      if (pixels[index + 3] && pixels[index]! / 255 <= item.intensity) { result.push(point); break; }
    }
  }
  return result;
}

/** A random point on an outer face of the box (not the bottom). */
function surfacePoint(box: Box3, size: Vector3, next: () => number): Vector3 {
  const face = Math.floor(next() * 5), u = next(), v = next();
  const point = new Vector3(box.min.x + size.x * u, box.min.y + size.y * v, box.min.z + size.z * u);
  if (face === 0) point.y = box.max.y;
  else if (face === 1) point.x = box.min.x; else if (face === 2) point.x = box.max.x;
  else if (face === 3) point.z = box.min.z; else point.z = box.max.z;
  return point;
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

/** Average colour of the texture area this mesh's UVs cover, so debris looks like its own stone. */
function averageColor(mesh: Mesh): Color {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as MeshStandardMaterial;
  const fallback = material?.color?.clone() ?? new Color('#343342');
  const image = material?.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  const uv = mesh.geometry.getAttribute('uv');
  if (!image || !uv || typeof document === 'undefined') return fallback;
  try {
    let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
    for (let index = 0; index < uv.count; index++) {
      u0 = Math.min(u0, uv.getX(index)); u1 = Math.max(u1, uv.getX(index)); v0 = Math.min(v0, uv.getY(index)); v1 = Math.max(v1, uv.getY(index));
    }
    const flip = material.map!.flipY;
    const sx = u0 * image.width, sw = Math.max(1, (u1 - u0) * image.width);
    const sy = (flip ? 1 - v1 : v0) * image.height, sh = Math.max(1, (v1 - v0) * image.height);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, sx, sy, sw, sh, 0, 0, 8, 8);
    const data = context.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index + 3]! > 128) { r += data[index]!; g += data[index + 1]!; b += data[index + 2]!; n++; }
    return n ? new Color().setRGB(r / n / 255, g / n / 255, b / n / 255, 'srgb').multiply(fallback) : fallback;
  } catch { return fallback; }
}
