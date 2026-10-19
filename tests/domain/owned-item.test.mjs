import assert from 'node:assert/strict';
import test from 'node:test';
import { canAfford, copyBalances, copyOwnedItem, mergeTwins } from '../../src/domain/owned-item.ts';

const item = { id: 'pick', title: 'Кирка', image: '/pick.svg', rarity: 'rare', displayWeight: 0 };
const offers = { repair: { resource: 'deep-ore', value: 16 }, salvage: { resource: 'deep-ore', value: 8 }, sell: { resource: 'currency', value: 20 }, mergeRepair: 70 };
const owned = (id, state, extra = {}) => copyOwnedItem({ id, item, state, origin: 'chest', offers, ...extra });

test('only two different damaged items of one kind are merge twins', () => {
  const a = owned('a', 'heavy'), b = owned('b', 'slight'), whole = owned('c', 'intact');
  const other = copyOwnedItem({ id: 'd', item: { ...item, id: 'lamp' }, state: 'broken', origin: 'x', offers });
  const all = [a, b, whole, other];
  assert.deepEqual(mergeTwins(all, a).map(twin => twin.id), ['b']);
  assert.deepEqual(mergeTwins(all, whole), [], 'an intact item merges with nothing');
  assert.deepEqual(mergeTwins(all, other), []);
});

test('an item the rulebook no longer knows has no offers and cannot be merged', () => {
  const retired = copyOwnedItem({ id: 'r', item, state: 'heavy', origin: 'x' });
  assert.equal(retired.offers, undefined);
  assert.deepEqual(mergeTwins([retired, owned('a', 'heavy')], retired), []);
  assert.deepEqual(mergeTwins([retired, owned('a', 'heavy')], owned('a', 'heavy')), []);
});

test('owned items and balances are validated and frozen', () => {
  assert.throws(() => copyOwnedItem({ id: 'a', item, state: 'melted', origin: 'x' }));
  assert.throws(() => owned('a', 'heavy', { offers: { ...offers, sell: { resource: 'currency', value: 1.5 } } }));
  assert.throws(() => owned('a', 'heavy', { offers: { ...offers, mergeRepair: 120 } }));
  assert.ok(Object.isFrozen(owned('a', 'heavy').offers.repair));
  const balances = copyBalances({ 'deep-ore': 16 });
  assert.ok(canAfford(balances, offers.repair));
  assert.ok(!canAfford(balances, { resource: 'deep-ore', value: 17 }));
  assert.ok(!canAfford(balances, { resource: 'end-shards', value: 1 }), 'a resource never held is zero');
  assert.throws(() => copyBalances({ currency: -1 }));
});
