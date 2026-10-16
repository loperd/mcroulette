import { AdditiveBlending, Box3, BoxGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, Plane,
  PlaneGeometry, PointLight, Quaternion, RingGeometry, Vector3, type BufferGeometry, type Material, type Object3D } from 'three';
import type { BreakMoment, BreakPattern, ChestBreakage } from '../../../domain/chest-breakage.ts';
import { resolveModifications, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import { defaultDebris, type ChestModificationProfile, type DebrisStyle } from '../../../domain/chest-modifications.ts';
import { meshesOf } from './chest-appearance.ts';
import { fractureCells } from './chest-fracture-geometry.ts';
import { random } from './chest-surface-patterns.ts';

/**
 * Opening timeline (0..1 of its duration): from CHARGE_AT the energy builds up (glow, swelling,
 * trembling, first chips); at BURST_AT the chest gives way.
 */
export const CHARGE_AT = .06, BURST_AT = .22;

/** Fragments per pattern: base + severity × extra. `fall` keeps the part whole. */
const FRAGMENTS: Record<BreakPattern, [number, number]> = { shatter: [7, 9], split: [2, 2], crumble: [6, 7], fall: [1, 0] };
/** Cut normals: shatter in any direction, split and crumble mostly vertical (slabs that topple). */
const FLATNESS: Record<BreakPattern, number> = { shatter: 0, split: .55, crumble: .35, fall: 0 };

interface Piece {
  readonly mesh: Mesh; readonly velocity: Vector3; readonly spin: Vector3; readonly shape: DebrisStyle['shape'];
  readonly size: number; age: number; readonly life: number;
}
/** A geometric fragment: the original mesh clipped to one convex cell and moved as a rigid body. */
interface Fragment {
  readonly mesh: Mesh; readonly local: readonly Plane[]; readonly planes: Plane[]; readonly contacts: readonly Vector3[];
  readonly velocity: Vector3; readonly spin: Vector3; delay: number; resting: boolean;
}
interface PartSource {
  readonly meshes: Mesh[]; readonly severity: number; readonly detached: boolean; readonly pattern: BreakPattern;
  readonly debris: { style: DebrisStyle; weight: number }[];
}

const SHAPES: Record<DebrisStyle['shape'], { scale: [number, number, number]; gravity: number; drag: number; life: number }> = {
  chip: { scale: [1, 1, 1], gravity: 9.8, drag: .2, life: 2.6 },
  shard: { scale: [.55, 1.8, .55], gravity: 9.8, drag: .2, life: 2.6 },
  flake: { scale: [1.1, .25, 1.1], gravity: 6, drag: 1.2, life: 2.4 },
  leaf: { scale: [1.4, 1.4, 1], gravity: 2.5, drag: 2.2, life: 2.8 },
  spark: { scale: [.55, .55, .55], gravity: 1.5, drag: 1.5, life: .9 },
  puff: { scale: [2.6, 2.6, 2.6], gravity: -.6, drag: 3, life: 1.1 },
};

/**
 * Draws the server-decided breakage. Two stories:
 *   impact  — mechanical: the hit cracks the chest, fragments slump and slide along the ground, dust;
 *   opening — energy overload: the chest swells, trembles and glows, then bursts with a flash and a
 *             floor shockwave, fragments flung in every direction.
 * Each part follows its own fate (body destroyed, lid falls off, latch breaks). The fracture is
 * geometry computed from the seed (random plane cuts of the real textured mesh), so no two breaks
 * look alike. What else flies off depends on the part's modifications: rust flakes, moss and
 * leaves, ice shards, rune sparks.
 */
export class ChestBreakageEffects {
  private readonly sources: PartSource[] = [];
  /** Parts not in the breakage: they ride on the carrier and fall when it is destroyed. */
  private readonly riders: Mesh[][] = [];
  private carrierDetached = false;
  private readonly pieces: Piece[] = [];
  private readonly fragments: Fragment[] = [];
  private readonly geometries = new Map<string, BufferGeometry>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly owned: Material[] = [];
  private readonly world: Object3D;
  private readonly chest: Object3D;
  private readonly floorY: number;
  private readonly seed: number;
  private next: () => number;
  private readonly moment: BreakMoment;
  private readonly accent: Color;
  private readonly flash = new PointLight(0xffffff, 0, 8, 2);
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
    const resolved = resolveModifications(appearance, profile);
    for (const item of breakage.parts) {
      const meshes = meshesOf(chest, parts.get(item.part) ?? []);
      if (!meshes.length || (item.severity === 0 && !item.detached)) continue;
      const debris = [{ style: { shape: 'chip', color: '#' + averageColor(meshes[0]!).getHexString(), share: 1 } as DebrisStyle, weight: 1 },
        ...resolved.filter(mod => mod.definition.parts.includes(item.part))
          .map(mod => { const style = defaultDebris(mod.definition, accent); return { style, weight: style.share * mod.intensity }; })];
      this.sources.push({ meshes, severity: item.severity, detached: item.detached, pattern: item.pattern, debris });
    }
    // The first profile part carries the others (the body under lid and latch).
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

  /** Whether anything breaks, and when. */
  get active(): boolean { return this.sources.length > 0; }
  get breaksOnImpact(): boolean { return this.active && this.moment === 'impact'; }
  /** True once the break has happened (fragments are flying or lying around). */
  get broken(): boolean { return this.burst; }

  start(reduced: boolean): void { this.reset(); this.reduced = reduced; }

  /** The hard landing: mechanical damage, low and sideways from where the chest hit. */
  impact(): void {
    if (!this.breaksOnImpact || this.burst) return;
    this.charged = this.burst = true;
    for (const source of this.sources) this.grit(source, Math.round(source.severity * 14), .7, 'impact');
    this.detach('impact');
    this.dust();
  }

  /**
   * Opening: progress 0..1 of its duration, delta in seconds. Call after the scene has posed the
   * chest for this frame: the energy build-up adds its swell and tremble on top.
   */
  update(delta: number, progress = 0): void {
    if (this.moment === 'opening' && this.active && !this.burst && progress >= CHARGE_AT) {
      if (!this.charged) { this.charged = true; for (const source of this.sources) this.grit(source, Math.round(source.severity * 8), .5, 'opening'); }
      // The chest strains against the power inside.
      const charge = Math.min(1, (progress - CHARGE_AT) / (BURST_AT - CHARGE_AT)), strength = this.strength();
      if (!this.reduced) {
        this.chest.scale.multiplyScalar(1 + charge ** 2 * .06 * strength);
        this.chest.position.x += (this.next() - .5) * charge * .03 * strength;
        this.chest.position.z += (this.next() - .5) * charge * .03 * strength;
      }
      this.glow(charge * 6 * strength);
      if (progress >= BURST_AT) {
        this.burst = true;
        for (const source of this.sources) this.grit(source, Math.round(source.severity * 12), 1.4, 'opening');
        this.detach('opening');
        if (!this.reduced) this.shockwave();
        this.flashAge = 0;
      }
    }
    const step = Math.min(delta, .05);
    this.animateEnergy(step);
    this.simulatePieces(step);
    this.simulateFragments(step);
  }

  reset(): void {
    this.charged = this.burst = false;
    this.next = random(this.seed); // a replayed session breaks the same way
    this.flash.intensity = 0; this.flash.removeFromParent(); this.flashAge = this.ringAge = Infinity; this.ring?.removeFromParent();
    for (const source of this.sources) for (const mesh of source.meshes) mesh.visible = true;
    for (const meshes of this.riders) for (const mesh of meshes) mesh.visible = true;
    for (const piece of this.pieces) piece.mesh.removeFromParent();
    for (const fragment of this.fragments) fragment.mesh.removeFromParent();
    for (const material of this.owned) material.dispose();
    this.pieces.length = this.fragments.length = this.owned.length = 0;
  }

  dispose(): void {
    this.reset();
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    (this.ring?.material as Material | undefined)?.dispose();
    this.geometries.clear(); this.materials.clear(); this.sources.length = 0;
    this.flash.dispose();
  }

  /** More detached parts, bigger burst. */
  private strength() {
    const detached = this.sources.filter(source => source.detached).length;
    return .5 + Math.min(1, detached / Math.max(1, this.sources.length)) * .8;
  }

  private detach(moment: BreakMoment) {
    this.chest.updateWorldMatrix(true, true);
    const chestCentre = new Box3().setFromObject(this.chest).getCenter(new Vector3());
    for (const source of this.sources.filter(item => item.detached)) {
      if (!this.reduced) {
        const [base, extra] = FRAGMENTS[source.pattern];
        for (const mesh of source.meshes) this.fracture(mesh, source, moment, base + Math.round(source.severity * extra), chestCentre);
        if (source.pattern !== 'fall') this.grit(source, 6 + Math.round(source.severity * (source.pattern === 'shatter' ? 18 : 8)), moment === 'opening' ? 1.6 : .8, moment, true);
      }
      for (const mesh of source.meshes) mesh.visible = false;
    }
    // Nothing holds the lid and latch up any more: they drop as they are.
    if (this.carrierDetached && !this.reduced) {
      const rider: PartSource = { meshes: [], severity: 0, detached: true, pattern: 'fall', debris: [] };
      for (const meshes of this.riders) for (const mesh of meshes) { this.fracture(mesh, rider, 'impact', 1, chestCentre); mesh.visible = false; }
    }
  }

  /** Cuts the real mesh into convex cells (or keeps it whole for `fall`) and launches them. */
  private fracture(mesh: Mesh, source: PartSource, moment: BreakMoment, count: number, chestCentre: Vector3) {
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone();
    const cells = source.pattern === 'fall' ? fractureCells(box, 1, this.next) : fractureCells(box, count, this.next, FLATNESS[source.pattern]);
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    mesh.matrixWorld.decompose(position, rotation, scale);
    const height = box.max.y - box.min.y || 1;
    for (const cell of cells) {
      let fragment: Mesh;
      let local: readonly Plane[] = [], planes: Plane[] = [];
      if (source.pattern === 'fall') {
        // In one piece, with its modifications (moss, rust, crystals) still on it.
        fragment = mesh.clone(true);
        fragment.visible = true;
      } else {
        local = cell.planes; planes = cell.planes.map(plane => plane.clone());
        const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
          const copy = material.clone(); copy.side = DoubleSide; copy.clippingPlanes = planes; copy.clipShadows = true;
          // Through a cut we see the inside of the far walls: darken back faces so the break reads as
          // solid broken material instead of a hollow shell.
          copy.onBeforeCompile = shader => {
            // A flat dark core, not the darkened texture: the texture's light pixels read as glitter.
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>',
              '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.022, 0.03, 0.032);');
          };
          copy.customProgramCacheKey = () => 'chest-fragment';
          this.owned.push(copy); return copy;
        });
        fragment = new Mesh(mesh.geometry, Array.isArray(mesh.material) ? materials : materials[0]!);
      }
      fragment.position.copy(position); fragment.quaternion.copy(rotation); fragment.scale.copy(scale);
      fragment.castShadow = true; fragment.userData.chestOverlay = true;
      this.world.add(fragment);
      const worldCentre = cell.centre.clone().applyMatrix4(mesh.matrixWorld);
      const away = worldCentre.clone().sub(chestCentre);
      if (away.lengthSq() < 1e-6) away.set(this.next() - .5, 0, this.next() - .5);
      away.normalize();
      const { velocity, spin } = this.launch(source.pattern, moment, away);
      // Contact points for the floor: a handful of the cell's samples, spread over it.
      const contacts = cell.points.filter((_, index) => index % Math.max(1, Math.floor(cell.points.length / 24)) === 0);
      const delay = source.pattern === 'crumble' ? (1 - (cell.centre.y - box.min.y) / height) * .6 + this.next() * .25 : 0;
      this.fragments.push({ mesh: fragment, local, planes, contacts, velocity, spin, delay, resting: false });
    }
  }

  /** Initial motion: the opening blasts outward and up, the impact slumps and slides. */
  private launch(pattern: BreakPattern, moment: BreakMoment, away: Vector3) {
    const r = () => this.next();
    const spin = new Vector3(r() - .5, r() - .5, r() - .5);
    if (moment === 'opening') {
      const speed = { shatter: 2.6 + r() * 2, split: 1.6 + r() * 1.2, crumble: .5 + r() * .5, fall: 1.2 + r() }[pattern];
      const lift = { shatter: 2 + r() * 1.5, split: 2.2 + r() * 1.2, crumble: .3, fall: 3.2 + r() }[pattern];
      return { velocity: away.clone().multiplyScalar(speed).setY(away.y * speed + lift), spin: spin.multiplyScalar(pattern === 'crumble' ? 3 : 9) };
    }
    const speed = { shatter: .9 + r() * .8, split: .5 + r() * .5, crumble: .2 + r() * .3, fall: .7 + r() * .5 }[pattern];
    return { velocity: away.clone().setY(0).normalize().multiplyScalar(speed).setY(.3 + r() * .5), spin: spin.multiplyScalar(pattern === 'fall' ? 4 : 3) };
  }

  private simulateFragments(delta: number) {
    const point = new Vector3();
    for (const fragment of this.fragments) {
      if (fragment.delay > 0) { fragment.delay -= delta; continue; } // crumble: still standing
      if (!fragment.resting) {
        fragment.velocity.y -= 9.8 * delta;
        fragment.mesh.position.addScaledVector(fragment.velocity, delta);
        fragment.mesh.rotation.x += fragment.spin.x * delta; fragment.mesh.rotation.y += fragment.spin.y * delta; fragment.mesh.rotation.z += fragment.spin.z * delta;
      }
      fragment.mesh.updateMatrixWorld(true);
      let lowest = Infinity;
      for (const contact of fragment.contacts) lowest = Math.min(lowest, point.copy(contact).applyMatrix4(fragment.mesh.matrixWorld).y);
      if (lowest < this.floorY) {
        fragment.mesh.position.y += this.floorY - lowest;
        fragment.velocity.y = Math.abs(fragment.velocity.y) * .25; fragment.velocity.x *= .5; fragment.velocity.z *= .5; fragment.spin.multiplyScalar(.4);
        if (fragment.velocity.lengthSq() < .05) fragment.resting = true;
        fragment.mesh.updateMatrixWorld(true);
      }
      // Clipping planes live in world space: carry them with the fragment every frame.
      for (let index = 0; index < fragment.planes.length; index++) {
        fragment.planes[index]!.copy(fragment.local[index]!).applyMatrix4(fragment.mesh.matrixWorld);
      }
    }
  }

  /** Small voxel debris: stone grit plus whatever the part's modifications are made of. */
  private grit(source: PartSource, count: number, force: number, moment: BreakMoment, volume = false) {
    if (this.reduced || count <= 0) return;
    this.chest.updateWorldMatrix(true, true);
    const centre = new Box3().setFromObject(this.chest).getCenter(new Vector3());
    const total = source.debris.reduce((sum, item) => sum + item.weight, 0);
    for (let index = 0; index < count; index++) {
      const mesh = source.meshes[Math.floor(this.next() * source.meshes.length)]!;
      const box = new Box3().setFromObject(mesh), size = box.getSize(new Vector3());
      const unit = Math.max(size.x, size.z) / 16; // one model texel
      let pick = this.next() * total, debris = source.debris[0]!.style;
      for (const item of source.debris) { pick -= item.weight; if (pick <= 0) { debris = item.style; break; } }
      const point = volume
        ? new Vector3(box.min.x + size.x * this.next(), box.min.y + size.y * this.next(), box.min.z + size.z * this.next())
        : surfacePoint(box, size, this.next);
      const shape = SHAPES[debris.shape];
      const velocity = moment === 'opening'
        ? point.clone().sub(centre).normalize().multiplyScalar((1.2 + this.next() * 2) * force).add(new Vector3(0, 1.2 * force, 0))
        : point.clone().sub(centre).setY(0).normalize().multiplyScalar((1 + this.next() * 1.5) * force).setY((.4 + this.next() * .9) * force);
      if (debris.shape === 'spark' || debris.shape === 'puff') velocity.multiplyScalar(.45);
      const piece = new Mesh(this.geometry(debris.shape), this.material(debris));
      const edge = unit * (1 + Math.floor(this.next() * 2));
      piece.scale.set(edge * shape.scale[0], edge * shape.scale[1], edge * shape.scale[2]);
      piece.position.copy(point);
      piece.rotation.set(this.next() * 6, this.next() * 6, this.next() * 6);
      piece.castShadow = debris.shape !== 'puff' && debris.shape !== 'spark';
      piece.userData.chestOverlay = true;
      this.world.add(piece);
      this.pieces.push({ mesh: piece, velocity, spin: new Vector3(this.next() - .5, this.next() - .5, this.next() - .5).multiplyScalar(14),
        shape: debris.shape, size: edge, age: 0, life: shape.life * (.75 + this.next() * .5) });
    }
  }

  private simulatePieces(delta: number) {
    for (let index = this.pieces.length - 1; index >= 0; index--) {
      const piece = this.pieces[index]!, shape = SHAPES[piece.shape];
      piece.age += delta;
      piece.velocity.y -= shape.gravity * delta;
      piece.velocity.multiplyScalar(Math.max(0, 1 - shape.drag * delta));
      piece.mesh.position.addScaledVector(piece.velocity, delta);
      piece.mesh.rotation.x += piece.spin.x * delta; piece.mesh.rotation.y += piece.spin.y * delta; piece.mesh.rotation.z += piece.spin.z * delta;
      const ground = this.floorY + piece.size * .5;
      if (piece.mesh.position.y < ground) {
        piece.mesh.position.y = ground;
        piece.velocity.y = Math.abs(piece.velocity.y) * .3; piece.velocity.x *= .55; piece.velocity.z *= .55; piece.spin.multiplyScalar(.5);
      }
      const remaining = piece.life - piece.age;
      if (piece.shape === 'puff') {
        piece.mesh.scale.multiplyScalar(1 + delta * .9);
        (piece.mesh.material as MeshStandardMaterial).opacity = Math.max(0, .45 * remaining / piece.life);
      } else if (remaining < .4) piece.mesh.scale.multiplyScalar(Math.max(.01, 1 - delta / Math.max(remaining, .02)));
      if (remaining <= 0) { piece.mesh.removeFromParent(); this.pieces.splice(index, 1); }
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
      const geometry = new RingGeometry(.9, 1, 48);
      this.geometries.set('ring', geometry);
      this.ring = new Mesh(geometry, new MeshBasicMaterial({ color: this.accent, transparent: true, opacity: .8, blending: AdditiveBlending,
        depthWrite: false, side: DoubleSide, toneMapped: false }));
      this.ring.rotation.x = -Math.PI / 2; this.ring.userData.chestOverlay = true;
    }
    this.ring.position.set(centre.x, this.floorY + .01, centre.z);
    this.world.add(this.ring);
    this.ringAge = 0;
  }

  private animateEnergy(delta: number) {
    if (Number.isFinite(this.flashAge)) {
      this.flashAge += delta;
      this.flash.intensity = this.reduced ? 0 : 60 * Math.exp(-this.flashAge * 5);
      if (this.flashAge > 1.2) { this.flashAge = Infinity; this.flash.intensity = 0; }
    }
    if (this.ring && Number.isFinite(this.ringAge)) {
      this.ringAge += delta;
      this.ring.scale.setScalar(.2 + this.ringAge * 5.5);
      (this.ring.material as MeshBasicMaterial).opacity = Math.max(0, .8 * (1 - this.ringAge / .7));
      if (this.ringAge > .7) { this.ringAge = Infinity; this.ring.removeFromParent(); }
    }
  }

  /** Floor-level dust where the chest hit. */
  private dust() {
    if (this.reduced) return;
    this.chest.updateWorldMatrix(true, false);
    const box = new Box3().setFromObject(this.chest), size = box.getSize(new Vector3());
    const unit = Math.max(size.x, size.z) / 16;
    for (let index = 0; index < 10; index++) {
      const piece = new Mesh(this.geometry('puff'), this.material({ shape: 'puff', color: '#8a908f', share: 1 }));
      const angle = this.next() * Math.PI * 2;
      piece.position.set(box.min.x + size.x * this.next(), this.floorY + unit, box.min.z + size.z * this.next());
      piece.scale.setScalar(unit * 2.4);
      piece.userData.chestOverlay = true;
      this.world.add(piece);
      this.pieces.push({ mesh: piece, velocity: new Vector3(Math.cos(angle), .15, Math.sin(angle)).multiplyScalar(1.4),
        spin: new Vector3(), shape: 'puff', size: unit * 2.4, age: 0, life: 1.2 + this.next() * .5 });
    }
  }

  private geometry(shape: DebrisStyle['shape']) {
    const key = shape === 'leaf' ? 'plane' : 'box';
    let geometry = this.geometries.get(key);
    if (!geometry) { geometry = key === 'plane' ? new PlaneGeometry(1, 1) : new BoxGeometry(1, 1, 1); this.geometries.set(key, geometry); }
    return geometry;
  }

  private material(debris: DebrisStyle) {
    if (debris.shape === 'puff') {
      // Puffs fade individually, so each gets its own material.
      const material = new MeshStandardMaterial({ color: debris.color, transparent: true, opacity: .45, depthWrite: false, roughness: 1 });
      this.owned.push(material);
      return material;
    }
    const key = `${debris.shape}:${debris.color}`;
    let material = this.materials.get(key);
    if (!material) {
      const glowing = debris.shape === 'spark' || debris.shape === 'shard' && new Color(debris.color).getHSL({ h: 0, s: 0, l: 0 }).s > .3;
      material = new MeshStandardMaterial({ color: debris.color, roughness: .85, side: debris.shape === 'leaf' ? DoubleSide : undefined,
        emissive: glowing ? debris.color : '#000000', emissiveIntensity: debris.shape === 'spark' ? 1.6 : .35 });
      this.materials.set(key, material);
    }
    return material;
  }
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

/** Average colour of the texture area this mesh's UVs cover, so grit looks like its own stone. */
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
    // Texture pixels are sRGB; material colours are linear.
    return n ? new Color().setRGB(r / n / 255, g / n / 255, b / n / 255, 'srgb').multiply(fallback) : fallback;
  } catch { return fallback; }
}
