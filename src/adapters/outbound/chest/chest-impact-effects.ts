import { AdditiveBlending, Color, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  Points, PointsMaterial, RingGeometry, PlaneGeometry, ShaderMaterial, type Scene } from 'three';

/** Model-independent impact; future case definitions supply their own palette. */
export class ChestImpactEffects {
  private readonly root = new Group();
  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(40 * 3);
  private readonly material: PointsMaterial;
  private readonly points: Points;
  private readonly ring: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly groundGlow = new Mesh(new PlaneGeometry(7, 7), new ShaderMaterial({
    uniforms: { strength: { value: 0 }, tint: { value: new Color() } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float strength; uniform vec3 tint; void main() { float glow = pow(max(0.0, 1.0 - length(vUv - 0.5) * 2.0), 3.0); gl_FragColor = vec4(tint, glow * strength); }',
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
  }));
  private age = Infinity;
  private reduced = false;

  constructor(scene: Scene, color = 0x86ead0) {
    this.groundGlow.material.uniforms.tint!.value.setHex(color);
    this.geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    this.material = new PointsMaterial({ color, size: 0.045, transparent: true, opacity: 0,
      depthWrite: false, blending: AdditiveBlending });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.ring = new Mesh(new RingGeometry(0.92, 1, 64), new MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: 2,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.groundGlow.rotation.x = -Math.PI / 2;
    this.root.add(this.points, this.ring, this.groundGlow); this.root.visible = false;
    scene.add(this.root);
  }

  approach(x: number, y: number, z: number, reduced: boolean): void {
    if (reduced) return;
    this.root.position.set(x, 0.035, z); this.root.visible = true;
    this.ring.visible = false; this.points.visible = true; this.groundGlow.visible = true;
    this.groundGlow.material.uniforms.strength!.value = 0.15 + 0.3 * Math.max(0, 1 - y / 3.3);
    this.material.opacity = 0.28;
    for (let i = 0; i < 40; i++) {
      const angle = i * 2.399963, length = (i % 10) / 10;
      this.positions[i * 3] = Math.cos(angle) * (0.5 + length * 0.3);
      this.positions[i * 3 + 1] = y + 0.7 + length * 1.2;
      this.positions[i * 3 + 2] = Math.sin(angle) * (0.5 + length * 0.3);
    }
    this.geometry.getAttribute('position').array.set(this.positions);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  /**
   * Touchdown: dust thrown out along the ground. The glow under the falling chest goes out here,
   * and no ring runs out: in a world the chest lands on real ground with a real shadow.
   */
  trigger(x: number, z: number, reduced: boolean): void {
    this.age = 0; this.reduced = reduced;
    this.root.position.set(x, 0.035, z); this.root.visible = true;
    this.points.visible = !reduced; this.ring.visible = false; this.groundGlow.visible = false;
    this.update(0);
  }

  update(delta: number): void {
    if (!Number.isFinite(this.age)) return;
    this.age += delta;
    if (this.age >= 0.85 || this.reduced) { this.reset(); return; }
    const p = this.age / 0.85;
    this.groundGlow.material.uniforms.strength!.value = (1 - p) ** 2 * 0.7;
    this.ring.scale.setScalar(0.65 + p * 2.2);
    this.ring.material.opacity = (1 - p) ** 2 * 0.28;
    this.material.opacity = (1 - p) ** 2 * 0.7;
    for (let i = 0; i < 40; i++) {
      const angle = i * 2.399963, speed = 0.7 + (i % 7) * 0.19;
      const radius = 0.4 + this.age * speed;
      this.positions[i * 3] = Math.cos(angle) * radius;
      this.positions[i * 3 + 1] = Math.max(0.01, this.age * (0.6 + (i % 5) * 0.12) - this.age ** 2 * 1.5);
      this.positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    this.geometry.getAttribute('position').array.set(this.positions);
    this.geometry.getAttribute('position').needsUpdate = true;
  }

  reset(): void { this.age = Infinity; this.root.visible = false; }
  dispose(): void {
    this.reset(); this.root.removeFromParent(); this.geometry.dispose(); this.material.dispose();
    this.groundGlow.geometry.dispose(); this.groundGlow.material.dispose();
    this.ring.geometry.dispose(); this.ring.material.dispose();
  }
}
