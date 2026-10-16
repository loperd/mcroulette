import assert from 'node:assert/strict';
import test from 'node:test';
import { caseOpenAction } from '../../src/application/case-open-action.ts';
import { createChestAppearance } from '../../src/domain/chest-appearance.ts';
const make = (id, status, caseId = 'ender') => ({ id, status, caseId, appearance: createChestAppearance() });

test('inspecting a used case offers opening another owned copy of the same type', () => {
  const available = make('gift', 'available');
  const result = caseOpenAction([make('used', 'opened'), make('other', 'available', 'other'), available], 'ender', 'used');
  assert.equal(result.target, available);
  assert.equal(result.availableCount, 1);
  assert.equal(result.label, 'Открыть следующий сундук');
});
test('selected available copy is preserved; consumed copies cannot be opened again', () => {
  const own = make('bought', 'available');
  assert.equal(caseOpenAction([make('first', 'available'), own], 'ender', 'bought').target, own);
  const result = caseOpenAction([make('used', 'opened')], 'ender', 'used');
  assert.equal(result.target, undefined); assert.equal(result.availableCount, 0);
  assert.equal(result.label, 'Вернуться в инвентарь');
});
test('pending openings can be resumed when there are no fresh copies', () => {
  const pending = make('pending', 'opening');
  const result = caseOpenAction([pending], 'ender');
  assert.equal(result.target, pending); assert.equal(result.label, 'Продолжить открытие');
});
