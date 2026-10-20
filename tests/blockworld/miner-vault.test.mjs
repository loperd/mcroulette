import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, InstancedMesh } from 'three';
import { MINER_VAULT } from '../../src/adapters/outbound/worlds/miner/index.ts';

// Canvas is used only for the embroidered banner texture; geometry needs no WebGL.
function withCanvas(run) {
  const original = globalThis.document;
  const context = new Proxy({}, { get: () => () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try { return run(); } finally { globalThis.document = original; }
}

test('miner vault owns its components, a clear chest landing and batched masonry', () => withCanvas(() => {
  const stage = MINER_VAULT.build(11);
  for (const name of ['01-fortress-and-portcullis', '02-receding-mine-tunnel', '03-cavern-rock-and-stalactites', '04-chest-dais-and-broken-ravine', '05-timber-galleries-and-railway', '06-minecarts-crates-and-tools', '07-miners-guild-banners', '08-molten-lava-cascade', '09-underground-waterfalls', '10-luminous-cyan-ore-veins', '11-ground-mist', '12-rising-embers']) {
    assert(stage.root.getObjectByName(name), name);
  }
  assert.deepEqual(stage.anchor, [0, -.5, 0]);
  assert.equal(stage.ground.floor, -.5);
  let meshes = 0, instances = 0;
  stage.root.traverse(o => { if (o.isMesh) meshes++; if (o instanceof InstancedMesh) instances += o.count; });
  assert(meshes < 300, 'repeated blocks must be instanced');
  assert(instances > 30000);
  const bounds = new Box3().setFromObject(stage.root);
  assert(bounds.min.z < -80 && bounds.max.y > 30);
  assert.equal(stage.transparent, undefined);
}));

test('miner atmosphere animates without a chest and preserves finite vertices', () => withCanvas(() => {
  const stage = MINER_VAULT.build(11);
  for (const time of [0, 1, 24, 1000]) {
    for (const actor of stage.living) actor.update({ time, wind: 0, rand: Math.random, host: undefined, gust() {}, flash() {}, blast() {} }, .016);
    stage.root.traverse(o => {
      const position = o.geometry?.attributes.position;
      if (position) for (const value of position.array) assert(Number.isFinite(value));
    });
  }
}));
