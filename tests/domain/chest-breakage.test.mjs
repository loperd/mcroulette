import assert from 'node:assert/strict';
import test from 'node:test';
import { copyChestBreakage } from '../../src/domain/chest-breakage.ts';
import { ENDER_CASE } from '../../src/config/cases.ts';

const profile = ENDER_CASE.model.modifications;
const rejects = value => assert.throws(() => copyChestBreakage(value, profile), error => error.code === 'INVALID_BREAKAGE');

test('server breakage is validated per part, with a moment and a pattern', () => {
  const value = copyChestBreakage({ seed: 5, moment: 'impact', parts: [{ part: 'lid', severity: .6, detached: true, pattern: 'fall' },
    { part: 'body', severity: .3, detached: false }] }, profile);
  assert.equal(value.moment, 'impact');
  assert.deepEqual(value.parts.map(item => [item.part, item.pattern]), [['lid', 'fall'], ['body', 'shatter']]);
  assert.ok(Object.isFrozen(value) && Object.isFrozen(value.parts[0]));
  const base = { seed: 1, moment: 'opening', parts: [] };
  rejects({ ...base, moment: 'later' });
  rejects({ ...base, seed: -1 });
  rejects({ ...base, parts: [{ part: 'wheel', severity: .5, detached: false }] });
  rejects({ ...base, parts: [{ part: 'lid', severity: 2, detached: false }] });
  rejects({ ...base, parts: [{ part: 'lid', severity: .5, detached: true, pattern: 'melt' }] });
  rejects({ ...base, parts: [{ part: 'lid', severity: .5, detached: true }, { part: 'lid', severity: .2, detached: false }] });
});
