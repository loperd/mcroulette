import assert from 'node:assert/strict';
import test from 'node:test';
import { copyCaseInstance, claimCase, completeCase, nextOwnedCase } from '../../src/domain/case-instance.ts';
import { createChestAppearance } from '../../src/domain/chest-appearance.ts';
import { item } from '../helpers.mjs';

const fresh = () => copyCaseInstance({ id: 'owned-1', caseId: 'ender', status: 'available', appearance: createChestAppearance() });
test('one owned instance has one opening session and one immutable result', () => {
  const available = fresh(), opening = claimCase(available, 's1');
  assert.equal(available.status, 'available'); assert.equal(opening.status, 'opening');
  assert.equal(claimCase(opening, 's1'), opening);
  assert.throws(() => claimCase(opening, 's2'), error => error.code === 'CASE_UNAVAILABLE');
  assert.throws(() => completeCase(opening, 's2', item('wrong')));
  const opened = completeCase(opening, 's1', item('prize'));
  assert.equal(opened.reward.id, 'prize'); assert.equal(completeCase(opened, 's1', item('other')), opened);
  assert.throws(() => claimCase(opened, 's3')); assert.ok(Object.isFrozen(opened));
});

test('stored case instances reject missing identities, appearance and opening session', () => {
  for (const value of [null, {}, { ...fresh(), id: '' }, { ...fresh(), status: 'opening' },
    { ...fresh(), status: 'opened', sessionId: 's1' }, { ...fresh(), appearance: {} }]) assert.throws(() => copyCaseInstance(value));
});

test('type inspection selects an owned available case, resumes unfinished cases and excludes consumed or other types', () => {
  const available = fresh(), opening = claimCase({ ...fresh(), id: 'pending' }, 's1');
  const opened = completeCase(claimCase({ ...fresh(), id: 'used' }, 's2'), 's2', item('prize'));
  const other = { ...fresh(), caseId: 'other' };
  assert.equal(nextOwnedCase([other, opened, opening, available], 'ender'), available);
  assert.equal(nextOwnedCase([other, opened, opening], 'ender'), opening);
  assert.equal(nextOwnedCase([other, opened], 'ender'), undefined);
});
