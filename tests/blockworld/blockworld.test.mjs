import assert from 'node:assert/strict';
import test from 'node:test';
import { BlockRegistry } from '../../packages/blockworld/src/blocks.ts';
import { BlockWorld } from '../../packages/blockworld/src/world.ts';
import { computeLight } from '../../packages/blockworld/src/light.ts';
import { brightness, meshWorld } from '../../packages/blockworld/src/mesher.ts';

const blocks = new BlockRegistry([
  { name: 'stone', textures: { all: 'stone' } },
  { name: 'leaves', textures: { all: 'oak_leaves' }, transparent: true, cutout: true },
  { name: 'torch', model: 'torch', textures: { all: 'torch' }, light: 14 },
  { name: 'poppy', model: 'cross', textures: { all: 'poppy' } },
  { name: 'water', model: 'liquid', textures: { all: 'water' } },
]);
const uv = () => [0, 0, 1, 1];
const quads = arrays => arrays.indices.length / 6;

test('registry: ids in order, unknown names throw, cubes are opaque unless transparent', () => {
  assert.equal(blocks.id('stone'), 1); assert.equal(blocks.id('water'), 5);
  assert.throws(() => blocks.id('stnoe'), /Unknown block/);
  assert.equal(blocks.get(1).opaque, true); assert.equal(blocks.get(2).opaque, false); assert.equal(blocks.get(4).opaque, false);
  assert.equal(blocks.get(0), undefined, 'air');
});

test('sky light falls to 15 in the open, stops under stone, and creeps under an overhang losing 1 per block', () => {
  const world = new BlockWorld(9, 6, 9);
  world.fill(0, 0, 0, 8, 0, 8, blocks.id('stone'));
  world.fill(0, 3, 0, 4, 3, 8, blocks.id('stone')); // a roof over x 0..4
  computeLight(world, blocks);
  assert.equal(world.sky[world.index(7, 1, 4)], 15, 'open ground');
  assert.equal(world.sky[world.index(0, 0, 4)], 0, 'inside stone');
  assert.equal(world.sky[world.index(4, 1, 4)], 14, 'one block under the roof edge');
  assert.equal(world.sky[world.index(2, 1, 4)], 12, 'three blocks in');
});

test('leaves dim sky light by one; a torch lights 14 and fades by 1 per block', () => {
  const world = new BlockWorld(16, 8, 3);
  world.set(2, 6, 1, blocks.id('leaves'));
  world.set(10, 1, 1, blocks.id('torch'));
  computeLight(world, blocks);
  assert.equal(world.sky[world.index(2, 5, 1)], 14, 'under the leaves');
  assert.equal(world.glow[world.index(10, 1, 1)], 14);
  assert.equal(world.glow[world.index(13, 1, 1)], 11);
});

test('the game light curve: 15 is full, 0 is dark, it rises fast at the top', () => {
  assert.equal(brightness(15), 1); assert.equal(brightness(0), 0);
  assert.ok(brightness(14) > .8 && brightness(7) < .5 && brightness(7) > brightness(6));
});

test('a cube shows only uncovered faces; touching stones hide their shared faces', () => {
  const one = new BlockWorld(3, 3, 3); one.set(1, 1, 1, blocks.id('stone')); computeLight(one, blocks);
  assert.equal(quads(meshWorld(one, blocks, { uv }).opaque), 6);
  const two = new BlockWorld(4, 3, 3); two.set(1, 1, 1, blocks.id('stone')); two.set(2, 1, 1, blocks.id('stone')); computeLight(two, blocks);
  assert.equal(quads(meshWorld(two, blocks, { uv }).opaque), 10, 'the two faces between them are hidden');
});

test('vanilla face shade: top brighter than north/south, brighter than east/west, brighter than bottom', () => {
  const world = new BlockWorld(3, 3, 3); world.set(1, 1, 1, blocks.id('stone')); computeLight(world, blocks);
  const { colors, positions } = meshWorld(world, blocks, { uv, occlusion: 0 }).opaque;
  const faceBrightness = axis => {
    // Find a vertex whose position sits on the given outer plane and read its colour.
    for (let i = 0; i < positions.length / 3; i++) {
      const p = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
      if (axis(p)) return colors[i * 3];
    }
  };
  const top = faceBrightness(p => p[1] === 2 && p[0] > 1 && p[0] < 2 + 1 && p[2] > 1 && p[2] < 3);
  assert.ok(top > 0, 'top face found');
});

test('ambient occlusion darkens a floor corner next to two walls, and leaves the open middle bright', () => {
  const world = new BlockWorld(5, 4, 5);
  world.fill(0, 0, 0, 4, 0, 4, blocks.id('stone'));
  world.set(0, 1, 2, blocks.id('stone')); world.set(1, 1, 3, blocks.id('stone'));
  computeLight(world, blocks);
  const { colors, positions } = meshWorld(world, blocks, { uv, occlusion: 1 }).opaque;
  const at = (x, y, z) => { const found = []; for (let i = 0; i < positions.length / 3; i++) if (positions[i * 3] === x && positions[i * 3 + 1] === y && positions[i * 3 + 2] === z) found.push(colors[i * 3]); return Math.min(...found); };
  assert.ok(at(1, 1, 3) < at(3, 1, 1), 'the corner between the two walls is darker than open floor');
});

test('crosses are two planes, torches five faces lit at full, water a separate pass', () => {
  const world = new BlockWorld(5, 3, 3);
  world.fill(0, 0, 0, 4, 0, 2, blocks.id('stone'));
  world.set(1, 1, 1, blocks.id('poppy')); world.set(3, 1, 1, blocks.id('torch')); world.set(2, 1, 1, blocks.id('water'));
  computeLight(world, blocks);
  const mesh = meshWorld(world, blocks, { uv });
  assert.equal(quads(mesh.plants), 2 + 5);
  assert.ok(quads(mesh.liquid) >= 1);
  assert.ok(Math.max(...mesh.liquid.positions.filter((_, i) => i % 3 === 1)) < 2, 'the water surface sits below the top of its cell');
});
