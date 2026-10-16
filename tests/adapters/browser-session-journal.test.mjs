import assert from 'node:assert/strict';
import test from 'node:test';
import { ScreenStorage } from '../../src/adapters/outbound/browser/screen-storage.ts';
import { BrowserSessionJournal } from '../../src/adapters/outbound/browser/browser-session-journal.ts';
import { item, constantRandom } from '../helpers.mjs';
import { ensureTarget } from '../../src/domain/strip.ts';
import { createSpinPlan } from '../../src/domain/spin-plan.ts';

test('versioned journals are isolated by case and reject corrupt plans', () => {
  const data = new Map(), storage = new ScreenStorage(() => ({ getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }));
  const ender = new BrowserSessionJournal(storage, 'ender'), wood = new BrowserSessionJournal(storage, 'wood');
  const prize = item('prize'), selection = ensureTarget([], prize, constantRandom());
  const checkpoint = { stage: 'roulette', sessionId: 's1', selection, plan: createSpinPlan(selection, constantRandom()) };
  ender.save(checkpoint); assert.deepEqual(ender.load(), checkpoint); assert.equal(wood.load(), undefined);
  ender.save({ ...checkpoint, plan: { ...checkpoint.plan, durationSeconds: -1 } }); assert.equal(ender.load(), undefined);
  storage.write('session:ender', { ...checkpoint, sessionId: '' }); assert.equal(ender.load(), undefined);
  ender.save(checkpoint); ender.clear(); assert.equal(ender.load(), undefined);
});

test('damaged, future-version and denied browser snapshots fall back safely', () => {
  let raw = '{bad';
  const storage = new ScreenStorage(() => ({ getItem: () => raw, setItem() {}, removeItem() {} }));
  assert.equal(storage.read('x', value => value), undefined);
  raw = JSON.stringify({ version: 99, value: 'future' }); assert.equal(storage.read('x', value => value), undefined);
  const denied = new ScreenStorage(() => { throw new Error('Denied'); });
  assert.equal(denied.read('x', value => value), undefined);
  assert.doesNotThrow(() => { denied.write('x', 'state'); denied.remove('x'); });
});
