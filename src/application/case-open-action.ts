import { isConsumed, nextOwnedCase, type CaseInstance } from '../domain/case-instance.ts';

/** An inspected, consumed case must not hide other owned cases of the same type. */
export function caseOpenAction(instances: readonly CaseInstance[], caseId: string, inspectedId?: string) {
  const inspected = instances.find(item => item.id === inspectedId && item.caseId === caseId);
  const target = inspected && !isConsumed(inspected) ? inspected : nextOwnedCase(instances, caseId);
  const label = !target ? 'Вернуться в архив' : target.status === 'opening' ? 'Продолжить открытие'
    : inspected && isConsumed(inspected) ? 'Открыть следующий сундук' : 'Открыть сундук';
  return { target, label, availableCount: instances.filter(item => item.caseId === caseId && item.status === 'available').length };
}
