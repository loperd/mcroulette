import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { fractureCells } from '../../src/adapters/outbound/chest/chest-fracture-geometry.ts';
import { random } from '../../src/adapters/outbound/chest/chest-surface-patterns.ts';
import { BURST_AT, ChestBreakageEffects } from '../../src/adapters/outbound/chest/chest-breakage-effects.ts';
import { demoBreakage } from '../../src/adapters/outbound/browser/demo-breakage.ts';
import { copyChestBreakage } from '../../src/domain/chest-breakage.ts';
import { changeChestAppearance, createChestAppearance } from '../../src/domain/chest-appearance.ts';
import { ENDER_CASE } from '../../src/config/cases.ts';

const profile = ENDER_CASE.model.modifications;
const box = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 1, 1));

test('fracture cells partition the part into convex pieces, differently per seed and identically per seed', () => {
  const cells = fractureCells(box, 6, random(3));
  assert.equal(cells.length, 6);
  // Every sample belongs to exactly one cell: each cell keeps what all its planes keep.
  const probe = Array.from({ length: 200 }, (_, index) => new Vector3(Math.sin(index) * .99, (index % 10) / 10 + .05, Math.cos(index * 1.7) * .99));
  for (const point of probe) {
    const owners = cells.filter(cell => cell.planes.every(plane => plane.distanceToPoint(point) >= 0));
    assert.equal(owners.length, 1);
  }
  const same = fractureCells(box, 6, random(3)).map(cell => cell.centre.toArray());
  assert.deepEqual(same, cells.map(cell => cell.centre.toArray()));
  assert.notDeepEqual(fractureCells(box, 6, random(4)).map(cell => cell.centre.toArray()), same);
  assert.equal(fractureCells(box, 1, random(3)).length, 1);
});

function chest() {
  const world = new Scene(), root = new Group(), geometry = new BoxGeometry(), material = new MeshStandardMaterial();
  const meshes = Object.fromEntries(profile.parts.map((part, index) => {
    const mesh = new Mesh(geometry, material); mesh.name = part.nodes[0]; mesh.position.y = .5 + index; root.add(mesh); return [part.id, mesh];
  }));
  world.add(root);
  return { world, root, meshes, dispose() { geometry.dispose(); material.dispose(); } };
}
const extras = world => world.children.filter(child => child.userData.chestOverlay);

test('impact breakage happens on the hit, mechanically, and hides detached parts until reset', () => {
  const { world, root, meshes, dispose } = chest();
  const breakage = copyChestBreakage({ seed: 9, moment: 'impact', parts: [{ part: 'body', severity: .8, detached: true, pattern: 'crumble' }] }, profile);
  const effects = new ChestBreakageEffects(world, root, profile, createChestAppearance(), breakage, '#35905f', 0);
  effects.start(false);
  effects.update(1 / 60, .5);
  assert.equal(effects.broken, false, 'an impact break never fires from the opening timeline');
  effects.impact();
  assert.equal(effects.broken, true); assert.equal(meshes.body.visible, false);
  assert.equal(meshes.lid.visible, false, 'the lid falls with the destroyed body');
  assert.ok(extras(world).length > 5);
  for (let step = 0; step < 240; step++) effects.update(1 / 60);
  for (const fragment of extras(world)) {
    fragment.updateMatrixWorld(true);
    assert.ok(fragment.position.y > -1, 'nothing falls through the floor');
  }
  effects.reset();
  assert.equal(meshes.body.visible, true); assert.equal(meshes.lid.visible, true); assert.equal(extras(world).length, 0);
  effects.dispose(); dispose();
});

test('opening breakage charges, then bursts at its moment; a fallen part keeps its modifications', () => {
  const { world, root, meshes, dispose } = chest();
  const overlay = new Mesh(meshes.lid.geometry, new MeshStandardMaterial()); overlay.userData.chestOverlay = true; meshes.lid.add(overlay);
  const breakage = copyChestBreakage({ seed: 2, moment: 'opening', parts: [{ part: 'lid', severity: .5, detached: true, pattern: 'fall' }] }, profile);
  const appearance = changeChestAppearance(createChestAppearance(), { modifications: [{ id: 'moss', intensity: .8 }] });
  const effects = new ChestBreakageEffects(world, root, profile, appearance, breakage, '#35905f', 0);
  effects.start(false);
  effects.impact();
  assert.equal(effects.broken, false, 'an opening break ignores the impact');
  effects.update(1 / 60, BURST_AT * .9);
  assert.equal(effects.broken, false); assert.ok(root.scale.x > 1, 'the chest swells with energy before it gives way');
  effects.update(1 / 60, BURST_AT);
  assert.equal(effects.broken, true); assert.equal(meshes.lid.visible, false); assert.equal(meshes.body.visible, true);
  const fallen = extras(world).find(child => child.children.some(grand => grand.userData.chestOverlay));
  assert.ok(fallen, 'the fallen lid carries its overlays');
  effects.dispose(); overlay.material.dispose(); dispose();
});

test('demo fate: pristine chests never break, the same instance always breaks the same way', () => {
  const pristine = { id: 'a', caseId: 'ender', status: 'available', appearance: createChestAppearance() };
  assert.deepEqual(demoBreakage(pristine, profile).parts, []);
  const worn = { ...pristine, id: 'b', appearance: changeChestAppearance(createChestAppearance(), { modifications: [
    { id: 'body-cracks', intensity: .95 }, { id: 'lid-cracks', intensity: .9 }, { id: 'latch-rust', intensity: .9 }] }) };
  const fate = demoBreakage(worn, profile);
  assert.deepEqual(demoBreakage(worn, profile), fate);
  assert.ok(fate.parts.length >= 1);
  assert.ok(fate.parts.every(item => item.detached), 'a decrepit chest comes apart entirely');
  assert.ok(fate.parts.every(item => item.part !== 'body' || item.pattern !== 'fall'), 'the carrier never falls off whole');
});
