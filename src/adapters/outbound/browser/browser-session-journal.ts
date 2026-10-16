import { copyItem } from '../../../domain/item.ts';
import { assertTarget, type TargetSelection } from '../../../domain/strip.ts';
import type { SpinPlan } from '../../../domain/spin-plan.ts';
import type { SessionCheckpoint, SessionJournal } from '../../../application/ports/session-journal.ts';
import { ScreenStorage } from './screen-storage.ts';

export function decodeCheckpoint(value: unknown): SessionCheckpoint {
  if (!value || typeof value !== 'object') throw new Error('Invalid session.');
  const v = value as Record<string, unknown>;
  if (typeof v.sessionId !== 'string' || !v.sessionId.trim() || v.sessionId.length > 256) throw new Error('Invalid session id.');
  if (v.stage === 'chest') return { stage: 'chest', sessionId: v.sessionId,
    ...(v.prize ? { prize: copyItem(v.prize as Parameters<typeof copyItem>[0]) } : {}) };
  if (v.stage !== 'roulette' && v.stage !== 'prize') throw new Error('Invalid stage.');
  const selection = v.selection as TargetSelection, plan = v.plan as SpinPlan;
  if (!selection || !Array.isArray(selection.slots) || selection.slots.length > 2000) throw new Error('Invalid strip.');
  assertTarget(selection);
  if (!plan || !Object.values(plan).every(x => typeof x === 'number' && Number.isFinite(x))
    || plan.slotCount !== selection.slots.length || plan.targetIndex !== selection.targetIndex
    || !Number.isSafeInteger(plan.fullTurns) || plan.fullTurns < 0
    || plan.durationSeconds <= 0 || plan.durationSeconds > 120 || plan.distance <= 0
    || plan.startPosition < 0 || plan.endPosition <= plan.startPosition || plan.timeScale <= 0 || plan.deceleration <= 0
    || Math.abs(plan.endPosition - plan.startPosition - plan.distance) > 1e-6
    || Math.abs(plan.targetOffsetFraction) > 0.4) throw new Error('Invalid spin plan.');
  return { stage: v.stage, sessionId: v.sessionId, selection: Object.freeze({
    slots: Object.freeze(selection.slots.map(slot => Object.freeze({ id: slot.id, item: copyItem(slot.item) }))),
    prize: copyItem(selection.prize), targetIndex: selection.targetIndex,
  }), plan: Object.freeze({ ...plan }) };
}

export class BrowserSessionJournal implements SessionJournal {
  private readonly storage: ScreenStorage;
  private readonly key: string;
  constructor(storage: ScreenStorage, caseId: string) { this.storage = storage; this.key = `session:${caseId}`; }
  load(): SessionCheckpoint | undefined { return this.storage.read(this.key, decodeCheckpoint); }
  save(checkpoint: SessionCheckpoint): void { this.storage.write(this.key, checkpoint); }
  clear(): void { this.storage.remove(this.key); }
}
