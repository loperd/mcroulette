import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { buildFragment, fractureCells } from '../../src/adapters/outbound/chest/chest-fracture-geometry.ts';
import { random } from '../../src/adapters/outbound/chest/chest-surface-patterns.ts';
import { BURST_AT, ChestBreakageEffects } from '../../src/adapters/outbound/chest/chest-breakage-effects.ts';
import { demoBreakage } from '../../src/adapters/outbound/browser/demo-breakage.ts';
import { copyChestBreakage } from '../../src/domain/chest-breakage.ts';
import { changeChestAppearance, createChestAppearance } from '../../src/domain/chest-appearance.ts';
import { ENDER_CASE } from '../../src/config/cases.ts';

await RAPIER.init();
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

test('fragments are closed solids whose volumes add up to the part, outside textured and inside broken', () => {
  const geometry = new BoxGeometry(2, 1, 2); geometry.translate(0, .5, 0);
  const cells = fractureCells(box, 5, random(11));
  const fragments = cells.map(cell => buildFragment(geometry, cell, new Matrix4(), 1 / 16)).filter(Boolean);
  assert.equal(fragments.length, cells.length);
  const total = fragments.reduce((sum, fragment) => sum + fragment.volume, 0);
  assert.ok(Math.abs(total - 4) < 1e-3, `volumes sum to the box: ${total}`);
  for (const fragment of fragments) {
    assert.equal(fragment.geometry.groups.length, 2);
    assert.ok(fragment.geometry.groups[1].count > 0, 'every chunk has a broken face');
    assert.ok(fragment.geometry.getAttribute('sourcePosition'), 'overlays can project from the source surface');
  }
  // A weak spot pulls a cut through it.
  const weak = [new Vector3(.7, .5, -.3)];
  const near = fractureCells(box, 2, random(5), .25, .5, weak);
  assert.ok(Math.abs(near[0].planes[0].distanceToPoint(weak[0])) < 1e-9, 'the cut runs through the rust');
  geometry.dispose(); for (const fragment of fragments) fragment.geometry.dispose();
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
  assert.equal(fate.destroyed, true, 'a decrepit chest never survives');
  // Even when only the lid is decrepit, the whole chest gives way.
  const lidOnly = { ...pristine, id: 'c', appearance: changeChestAppearance(createChestAppearance(), { modifications: [{ id: 'lid-cracks', intensity: .9 }] }) };
  const lidFate = demoBreakage(lidOnly, profile);
  assert.equal(lidFate.destroyed, true); assert.ok(lidFate.parts.some(item => item.part === 'body' && item.detached));
  assert.ok(fate.parts.every(item => item.part !== 'body' || item.pattern !== 'fall'), 'the carrier never falls off whole');
});

test('the beam tears loose growth off the top and throws it up; the chest itself stays put', () => {
  const { world, root, meshes, dispose } = chest();
  const snow = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); snow.userData.loose = true; snow.userData.chestOverlay = true;
  snow.scale.set(.2, .1, .2); snow.position.y = .6; meshes.lid.add(snow);
  const low = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); low.userData.loose = true; low.position.y = -.9; meshes.body.add(low);
  const effects = new ChestBreakageEffects(world, root, profile, createChestAppearance(), copyChestBreakage({ seed: 3, moment: 'opening', parts: [] }, profile), '#35905f', 0);
  effects.start(false);
  const before = new Vector3(); snow.getWorldPosition(before);
  effects.beam(1);
  assert.equal(snow.parent, world, 'torn off the lid into the world');
  assert.equal(low.parent, meshes.body, 'below the top of the body nothing is blown away');
  for (let step = 0; step < 20; step++) effects.update(1 / 60);
  assert.ok(snow.matrix.elements[13] > before.y + .2, 'it flies up');
  effects.beam(1); // fires once per opening
  effects.reset();
  assert.equal(snow.parent, meshes.lid, 'reset puts it back');
  assert.equal(meshes.lid.visible && meshes.body.visible, true);
  effects.dispose(); snow.geometry.dispose(); low.geometry.dispose(); dispose();
});
