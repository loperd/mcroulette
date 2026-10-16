import assert from 'node:assert/strict';
import test from 'node:test';
import { DemoInventoryStore } from '../../src/adapters/outbound/browser/demo-inventory-store.ts';
import { ScreenStorage } from '../../src/adapters/outbound/browser/screen-storage.ts';
import { changeChestAppearance } from '../../src/domain/chest-appearance.ts';
import { item } from '../helpers.mjs';

test('demo ownership, individual changes and results survive a reload independently', () => {
  const values = new Map(), storage = new ScreenStorage(() => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }));
  const inventory = new DemoInventoryStore(storage), [first, second] = inventory.getState();
  assert.equal(inventory.getState().length, 4);
  assert.notDeepEqual(first.appearance, second.appearance);
  inventory.claim(first.id, 's1'); inventory.updateAppearance(first.id, changeChestAppearance(first.appearance, { modifications: [{ id: 'body-cracks', intensity: .9 }] }));
  const restored = new DemoInventoryStore(storage);
  assert.equal(restored.getState()[0].status, 'opening'); assert.deepEqual(restored.getState()[0].appearance.modifications.map(item => [item.id, item.intensity]), [['body-cracks', .9]]);
  assert.deepEqual(restored.getState()[1].appearance, second.appearance);
  restored.complete(first.id, 's1', item('reward'));
  const reloaded = new DemoInventoryStore(storage);
  assert.equal(reloaded.getState()[0].reward.id, 'reward');
  assert.throws(() => reloaded.claim(first.id, 's2'));
  assert.throws(() => reloaded.claim('not-owned', 's3'));
  reloaded.addDemoCase(); assert.equal(reloaded.getState().length, 5);
});

test('demo top-up gives each registered type 100 available cases once, preserving ownership on reload', async () => {
  const { ENDER_CASE } = await import('../../src/config/cases.ts');
  const cases = [ENDER_CASE, { ...ENDER_CASE, id: 'another-type' }];
  const values = new Map(), storage = new ScreenStorage(() => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }));
  const inventory = new DemoInventoryStore(storage);
  const first = inventory.getState()[0];
  inventory.claim(first.id, 'existing'); inventory.complete(first.id, 'existing', item('saved'));
  inventory.seedDemoStock(cases);
  for (const definition of cases) assert.equal(inventory.getState().filter(value => value.caseId === definition.id && value.status === 'available').length, 100);
  assert.equal(inventory.getState().find(value => value.id === first.id).reward.id, 'saved');
  assert.equal(new Set(inventory.getState().map(value => value.id)).size, inventory.getState().length);
  const next = inventory.getState().find(value => value.status === 'available');
  inventory.claim(next.id, 'new');
  const restored = new DemoInventoryStore(storage); restored.seedDemoStock(cases);
  assert.equal(restored.getState().length, inventory.getState().length);
  assert.equal(restored.getState().find(value => value.id === next.id).status, 'opening');
});

test('demo drops follow a rolled condition: only catalogue entries, damage consistent across parts', async () => {
  const { ENDER_CASE } = await import('../../src/config/cases.ts');
  const values = new Map(), storage = new ScreenStorage(() => ({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }));
  const inventory = new DemoInventoryStore(storage);
  let state = 7; const random = () => (state = (state * 48271) % 2147483647) / 2147483647;
  for (let index = 0; index < 60; index++) inventory.addDemoCase(ENDER_CASE, random);
  const kinds = new Map(ENDER_CASE.model.modifications.catalog.map(entry => [entry.id, entry.kind]));
  const drops = inventory.getState().slice(-60).map(value => value.appearance.modifications);
  for (const drop of drops) for (const item of drop) assert.ok(kinds.has(item.id) && item.intensity > 0 && item.intensity <= 1);
  const cracks = drop => drop.filter(item => kinds.get(item.id) === 'fracture');
  assert.ok(drops.some(drop => cracks(drop).length === 0) && drops.some(drop => cracks(drop).length > 0), 'both intact and cracked chests drop');
  // A cracked chest is cracked everywhere the model can crack: body and lid share one condition roll.
  for (const drop of drops.filter(drop => cracks(drop).length)) {
    assert.equal(cracks(drop).length, 2);
    assert.ok(Math.abs(cracks(drop)[0].intensity - cracks(drop)[1].intensity) <= .31);
  }
});
