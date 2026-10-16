import assert from 'node:assert/strict';
import test from 'node:test';
import { RecentFindStore } from '../../src/adapters/outbound/browser/recent-find-store.ts';
import { item } from '../helpers.mjs';

function harness() {
  let state = { phase: 'ready' }; const listeners = new Set(), values = new Map();
  const session = { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  return { session, storage, listeners, values, publish(value) { state = value; for (const listener of listeners) listener(); } };
}

test('only a revealed prize becomes a persistent, case-specific last find', () => {
  const h = harness(), store = new RecentFindStore(h.session, 'ender', () => h.storage);
  const prize = item('winner'); let updates = 0; store.subscribe(() => updates++);
  h.publish({ phase: 'spinning', sessionId: 's1', selection: { prize } });
  assert.equal(store.getState().item, null);
  h.publish({ phase: 'prize-visible', sessionId: 's1', selection: { prize } });
  assert.equal(store.getState().item.id, prize.id);
  h.publish({ phase: 'prize-visible', sessionId: 's1', selection: { prize } });
  assert.equal(updates, 1);
  const reloaded = new RecentFindStore(h.session, 'ender', () => h.storage);
  assert.equal(reloaded.getState().item.id, prize.id);
  h.publish({ phase: 'ready' });
  const other = new RecentFindStore(h.session, 'wood', () => h.storage);
  assert.equal(other.getState().item, null);
  store.dispose(); reloaded.dispose(); other.dispose();
  assert.equal(h.listeners.size, 0);
});

test('invalid history and denied storage cannot prevent normal play', () => {
  const h = harness(); h.values.set('voxel-vault:last-find:ender', '{bad json');
  const store = new RecentFindStore(h.session, 'ender', () => h.storage);
  assert.equal(store.getState().item, null); store.dispose();
  const blocked = new RecentFindStore(h.session, 'ender', () => { throw new Error('Denied'); });
  h.publish({ phase: 'prize-visible', sessionId: 's2', selection: { prize: item('found') } });
  assert.equal(blocked.getState().item.id, 'found'); blocked.dispose();
});
