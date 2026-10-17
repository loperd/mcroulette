import { copyChestAppearance, type ChestAppearance } from './chest-appearance.ts';
import { copyItem, type Item } from './item.ts';
import { DomainError } from './error.ts';

export interface CaseInstance {
  readonly id: string; readonly caseId: string; readonly appearance: ChestAppearance;
  /** destroyed: the chest could not hold the energy and broke apart; it gives no reward. */
  readonly status: 'available' | 'opening' | 'opened' | 'destroyed'; readonly sessionId?: string; readonly reward?: Item; readonly openedAt?: string;
}
export function copyCaseInstance(value: unknown): CaseInstance {
  if (!value || typeof value !== 'object') throw new DomainError('INVALID_CASE_INSTANCE', 'Invalid case instance.');
  const v = value as CaseInstance;
  if (![v.id, v.caseId].every(id => typeof id === 'string' && id.trim() && id.length <= 128)
    || !['available', 'opening', 'opened', 'destroyed'].includes(v.status)
    || v.status !== 'available' && (typeof v.sessionId !== 'string' || !v.sessionId.trim() || v.sessionId.length > 256)
    || v.status === 'opened' && !v.reward
    || v.openedAt !== undefined && (v.status !== 'opened' || typeof v.openedAt !== 'string' || !Number.isFinite(Date.parse(v.openedAt)))
    || v.status === 'available' && (v.sessionId !== undefined || v.reward !== undefined)
    || (v.status === 'opening' || v.status === 'destroyed') && v.reward !== undefined) throw new DomainError('INVALID_CASE_INSTANCE', 'Invalid case ownership state.');
  return Object.freeze({ id: v.id, caseId: v.caseId, appearance: copyChestAppearance(v.appearance), status: v.status,
    ...(v.status !== 'available' ? { sessionId: v.sessionId } : {}), ...(v.reward ? { reward: copyItem(v.reward) } : {}), ...(v.openedAt ? { openedAt: v.openedAt } : {}) });
}
export function claimCase(instance: CaseInstance, sessionId: string): CaseInstance {
  if (instance.status === 'opening' && instance.sessionId === sessionId) return instance;
  if (instance.status !== 'available') throw new DomainError('CASE_UNAVAILABLE', 'This case has already been opened or reserved.');
  return copyCaseInstance({ ...instance, status: 'opening', sessionId });
}
/** The opening session ends with the chest destroyed: consumed, no reward. */
export function destroyCase(instance: CaseInstance, sessionId: string): CaseInstance {
  if (instance.status === 'destroyed' && instance.sessionId === sessionId) return instance;
  if (instance.status !== 'opening' || instance.sessionId !== sessionId) throw new DomainError('CASE_UNAVAILABLE', 'The case belongs to a different session.');
  return copyCaseInstance({ ...instance, status: 'destroyed' });
}
/** Consumed one way or another: opened with a reward or destroyed. */
export function isConsumed(instance: CaseInstance): boolean { return instance.status === 'opened' || instance.status === 'destroyed'; }
export function completeCase(instance: CaseInstance, sessionId: string, reward: Item, openedAt = new Date().toISOString()): CaseInstance {
  if (instance.status === 'opened' && instance.sessionId === sessionId) return instance;
  if (instance.status !== 'opening' || instance.sessionId !== sessionId) throw new DomainError('CASE_UNAVAILABLE', 'The case belongs to a different session.');
  return copyCaseInstance({ ...instance, status: 'opened', reward, openedAt });
}

/** Prefer a fresh owned case; otherwise resume an unfinished opening of this type. */
export function nextOwnedCase(instances: readonly CaseInstance[], caseId: string): CaseInstance | undefined {
  return instances.find(item => item.caseId === caseId && item.status === 'available')
    ?? instances.find(item => item.caseId === caseId && item.status === 'opening');
}
