import type { CaseInstance } from '../../../domain/case-instance.ts';
import { copyChestBreakage, type BreakPattern, type ChestBreakage } from '../../../domain/chest-breakage.ts';
import { partConditions } from '../../../domain/chest-appearance.ts';
import type { ChestModificationProfile } from '../../../domain/chest-modifications.ts';

/**
 * Demo stand-in for the server roll. The real server decides from the case type and its
 * characteristics; this mimics it so the client can be built against the same contract:
 *   - the worse a part's condition, the likelier it chips and comes apart;
 *   - decrepit chests (very poor condition) come apart entirely;
 *   - the first profile part is the carrier (body) and never falls off whole; others (lid, latch)
 *     may simply fall off;
 *   - impact breaks are mechanical (crumble, split), opening breaks are energy bursts (shatter, split);
 *   - the chest counts as destroyed when its carrier (body) comes apart: no roulette, no reward.
 * Seeded by the instance, so the same chest always has the same fate.
 */
export function demoBreakage(instance: CaseInstance, profile: ChestModificationProfile): ChestBreakage {
  const next = seeded(hash(`${instance.id}:${instance.appearance.revision}`));
  const conditions = partConditions(instance.appearance, profile);
  const worst = Math.max(0, ...conditions.map(item => item.value));
  if (worst === 0) return copyChestBreakage({ seed: 0, moment: 'opening', parts: [], destroyed: false }, profile);
  const decrepit = worst >= .85;
  const moment = next() < .4 ? 'impact' : 'opening';
  const pick = (options: readonly BreakPattern[]) => options[Math.floor(next() * options.length)]!;
  const parts = conditions.flatMap(({ part, value }, index) => {
    if (value === 0 || next() > value + .15) return [];
    const detached = decrepit || next() < Math.max(0, (value - .45) / .55) * .8;
    const carrier = index === 0;
    const pattern = !detached ? 'shatter'
      : !carrier && next() < .55 ? 'fall'
      : moment === 'impact' ? pick(['crumble', 'split', 'split']) : pick(['shatter', 'shatter', 'split']);
    return [{ part: part.id, severity: Math.round(Math.min(1, value * (.6 + next() * .4)) * 100) / 100, detached, pattern }];
  });
  const carrier = profile.parts[0]?.id;
  const destroyed = parts.some(item => item.part === carrier && item.detached);
  return copyChestBreakage({ seed: Math.floor(next() * 0xffffffff), moment, parts, destroyed }, profile);
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}
function seeded(seed: number) {
  let state = seed || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
