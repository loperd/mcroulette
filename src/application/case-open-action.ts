import { isConsumed, nextOwnedCase, type CaseInstance } from '../domain/case-instance.ts';
import { variantKey } from './inventory-groups.ts';

/**
 * What "Open" does on a case screen. Counts and the next chest stay within the inspected chest's
 * variant (same look and condition, i.e. its inventory stack): a mossy chest is followed by another
 * one like it, not by whichever pristine chest of the type comes first. Only when none is left does
 * it fall back to any owned chest of the type.
 */
export function caseOpenAction(instances: readonly CaseInstance[], caseId: string, inspectedId?: string) {
  const inspected = instances.find(item => item.id === inspectedId && item.caseId === caseId);
  const variant = inspected ? variantKey(inspected) : undefined;
  const sameVariant = variant === undefined ? instances.filter(item => item.caseId === caseId)
    : instances.filter(item => item.caseId === caseId && variantKey(item) === variant);
  const target = inspected && !isConsumed(inspected) ? inspected
    : nextOwnedCase(sameVariant, caseId) ?? nextOwnedCase(instances, caseId);
  const label = !target ? 'Вернуться в архив' : target.status === 'opening' ? 'Продолжить открытие'
    : inspected && isConsumed(inspected) ? 'Открыть следующий сундук' : 'Открыть сундук';
  return { target, label, availableCount: sameVariant.filter(item => item.status === 'available').length };
}
