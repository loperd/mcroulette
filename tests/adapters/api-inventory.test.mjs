import assert from 'node:assert/strict';
import test from 'node:test';
import { loadedInventory, inventoryServer } from '../helpers.mjs';
import { ApiInventory } from '../../src/adapters/outbound/data/api-inventory.ts';
import { CASES } from '../../src/config/cases.ts';
import { issuedAppearance } from '../../src/config/issued-appearance.ts';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('chests come from the server; their look derives from the issued seed, or the changed look the server kept', async () => {
  const traveler = CASES.find(item => item.id === 'traveler');
  const changed = { ...issuedAppearance(traveler, 9), modifications: [{ id: 'body-cracks', intensity: .9, seed: 1 }] };
  const { inventory } = await loadedInventory([
    { id: 'a', caseId: 'traveler', seed: 42 },
    { id: 'b', caseId: 'traveler', seed: 9, appearance: changed },
    { id: 'c', caseId: 'some-future-type', seed: 1 },
  ]);
  assert.deepEqual(inventory.getState().map(chest => chest.id), ['a', 'b'], 'an unknown type is skipped');
  assert.deepEqual(inventory.getState()[0].appearance, issuedAppearance(traveler, 42), 'every client derives the same look');
  assert.deepEqual(inventory.getState()[1].appearance.modifications.map(item => item.id), ['body-cracks']);
});

test('opening asks the server, in order; the reward and state are what the server answers', async () => {
  const { inventory, server, errors } = await loadedInventory([{ id: 'a', caseId: 'traveler', seed: 3 }],
    { s1: { id: 'traveler-map', title: 'Карта', image: 'images/map.webp', type: 'legendary', chance: 12 } });
  inventory.claim('a', 's1');
  assert.equal(inventory.getState()[0].status, 'opening', 'shown at once');
  inventory.complete('a', 's1', { id: 'whatever-the-client-thinks', title: 'x', image: '/x.png', rarity: 'default', displayWeight: 1 });
  await settle(); await settle(); await settle();
  assert.deepEqual(errors, []);
  assert.equal(server.rows.get('a').status, 'opened');
  assert.equal(inventory.getState()[0].reward.id, 'traveler-map', 'the reward is the server\'s roll');
});

test('a change the server refuses is undone: the list is read again from the server and the refusal reported', async () => {
  const server = inventoryServer([{ id: 'a', caseId: 'traveler', seed: 3 }]), errors = [];
  const refusing = async (url, init = {}) => init.method ? { ok: false, status: 409, json: async () => ({}) } : server.fetcher(url, init);
  const inventory = new ApiInventory('https://example.test/', CASES, error => errors.push(error), refusing);
  await inventory.load();
  inventory.claim('a', 's1');
  await settle(); await settle(); await settle();
  assert.equal(errors.length, 1);
  assert.equal(inventory.getState()[0].status, 'available', 'back to what the server has');
});

test('nothing about chests touches browser storage', async () => {
  const touched = [];
  globalThis.localStorage = new Proxy({}, { get: (_, key) => { touched.push(key); return () => null; } });
  try {
    const { inventory } = await loadedInventory([{ id: 'a', caseId: 'traveler', seed: 3 }]);
    inventory.claim('a', 's1'); await settle();
    assert.deepEqual(touched, []);
  } finally { delete globalThis.localStorage; }
});
