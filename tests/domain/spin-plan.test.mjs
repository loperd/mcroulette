import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpinPlan, DEFAULT_SPIN_SETTINGS, positionAt } from '../../src/domain/spin-plan.ts';
import { buildStrip, ensureTarget } from '../../src/domain/strip.ts';
import { constantRandom, item, legacyCatalog, seededRandom } from '../helpers.mjs';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${actual} differs from ${expected}`);

test('spin stops inside the target for every seeded prize, jitter, and start position', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const random = seededRandom(seed);
    const catalog = legacyCatalog();
    const selection = ensureTarget(buildStrip(catalog, 40, random), catalog[seed % 14], random);
    const plan = createSpinPlan(selection, random, DEFAULT_SPIN_SETTINGS, seed * 0.71);
    const landing = positionAt(plan, plan.durationSeconds) % plan.slotCount;
    assert.equal(Math.floor(landing), selection.targetIndex);
    near(landing, selection.targetIndex + 0.5 + plan.targetOffsetFraction * 184 / 200);
    assert.ok(plan.targetOffsetFraction >= -0.4 && plan.targetOffsetFraction < 0.4);
    assert.ok(plan.durationSeconds >= 5 * 1.2);
  }
});

test('position depends on elapsed time rather than frame count', () => {
  const selection = ensureTarget([], item('a'), constantRandom());
  const plan = createSpinPlan(selection, constantRandom());
  for (const hz of [30, 60, 120]) {
    let previous = plan.startPosition;
    for (let frame = 0; frame / hz < plan.durationSeconds; frame += 1) {
      const position = positionAt(plan, frame / hz);
      assert.ok(position >= previous);
      assert.ok(position <= plan.endPosition);
      previous = position;
    }
    assert.equal(positionAt(plan, plan.durationSeconds + 1 / hz), plan.endPosition);
  }
  assert.equal(positionAt(plan, 0), plan.startPosition);
  near(positionAt(plan, plan.durationSeconds / 2), plan.startPosition + plan.distance * 0.75);
});

test('legacy acceleration and rounding determine full turns in logical slot units', () => {
  const catalog = legacyCatalog();
  const selection = ensureTarget(buildStrip(catalog, 40, constantRandom()), catalog[13], constantRandom());
  const plan = createSpinPlan(selection, constantRandom());
  assert.equal(plan.fullTurns, Math.ceil((500 * 25 / 2) / (40 * 155)));
  assert.equal(plan.fullTurns, 2);
  near(plan.durationSeconds, Math.sqrt(2 * plan.distance / (500 / 155)) * 1.2);
});

test('both extreme jitters stop inside the card instead of its gap', () => {
  const selection = ensureTarget([], item('a'), constantRandom());
  for (const jitter of [0, 1 - Number.EPSILON]) {
    const plan = createSpinPlan(selection, constantRandom(jitter));
    const fraction = plan.endPosition % plan.slotCount;
    assert.ok(fraction > (1 - 184 / 200) / 2);
    assert.ok(fraction < 1 - (1 - 184 / 200) / 2);
  }
});

test('invalid targets, settings, elapsed time and overflow cannot produce a spin', () => {
  const selection = ensureTarget([], item('a'), constantRandom());
  assert.throws(() => createSpinPlan({...selection, targetIndex: 1}, constantRandom()), {code:'INVALID_TARGET'});
  assert.throws(() => createSpinPlan({...selection, prize: item('b')}, constantRandom()), {code:'INVALID_TARGET'});
  for (const patch of [{deceleration:0}, {nominalTimeSeconds:-1}, {timeScale:NaN},
    {cardFraction:1.1}, {nominalTimeSeconds:1e308}]) {
    assert.throws(() => createSpinPlan(selection, constantRandom(), {...DEFAULT_SPIN_SETTINGS,...patch}),
      {code:'INVALID_SPIN'});
  }
  assert.throws(() => createSpinPlan(selection, constantRandom(), DEFAULT_SPIN_SETTINGS, -1),
    {code:'INVALID_SPIN'});
  const plan = createSpinPlan(selection, constantRandom());
  for (const elapsed of [-1, NaN, Infinity]) {
    assert.throws(() => positionAt(plan, elapsed), {code:'INVALID_SPIN'});
  }
});
