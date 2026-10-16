import assert from 'node:assert/strict';
import test from 'node:test';
import { claimCase, completeCase, copyCaseInstance, destroyCase, isConsumed } from '../../src/domain/case-instance.ts';
import { createChestAppearance } from '../../src/domain/chest-appearance.ts';
import { decodeCheckpoint } from '../../src/adapters/outbound/browser/browser-session-journal.ts';
import { item } from '../helpers.mjs';

test('a destroyed case is consumed without a reward, idempotently, and cannot be reopened', () => {
  const available = copyCaseInstance({ id: 'c', caseId: 'ender', status: 'available', appearance: createChestAppearance() });
  assert.throws(() => destroyCase(available, 's1'));
  const opening = claimCase(available, 's1');
  const destroyed = destroyCase(opening, 's1');
  assert.equal(destroyed.status, 'destroyed'); assert.equal(destroyed.reward, undefined);
  assert.equal(destroyCase(destroyed, 's1'), destroyed);
  assert.ok(isConsumed(destroyed));
  assert.throws(() => claimCase(destroyed, 's2'));
  assert.throws(() => completeCase(destroyed, 's1', item('x')));
  assert.throws(() => copyCaseInstance({ ...destroyed, reward: item('x') }));
  assert.deepEqual(copyCaseInstance(JSON.parse(JSON.stringify(destroyed))), destroyed);
  assert.deepEqual(decodeCheckpoint({ stage: 'destroyed', sessionId: 's1' }), { stage: 'destroyed', sessionId: 's1' });
});
