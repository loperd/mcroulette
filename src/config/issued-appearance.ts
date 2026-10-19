import type { CaseDefinition } from './cases.ts';
import { changeChestAppearance, copyChestAppearance, type ChestAppearance } from '../domain/chest-appearance.ts';

/**
 * The look of a chest as the server issued it. The server picks only a seed; every client derives
 * the same appearance from it. The condition is rolled first and drives the look: damage entries
 * follow it, ageing growth (moss, cobweb, vines, lichen) is likelier on older chests; weather and
 * the End are independent rare traits.
 */
export function issuedAppearance(definition: CaseDefinition, seed: number): ChestAppearance {
  const base = copyChestAppearance({ ...definition.appearance, seed: seed >>> 0 });
  const modifications = issuedModifications(definition, lcg(seed >>> 0));
  return modifications.length ? changeChestAppearance(base, { modifications }) : base;
}

const AGEING = new Set(['moss', 'cobweb', 'vines', 'lichen']), WEATHER = new Set(['snow', 'frost']);

function issuedModifications(definition: CaseDefinition, random: () => number) {
  const rank = [0, 0, 1, 1, 2, 3, 4][Math.floor(random() * 7)]!, level = rank / 4;
  const intensity = (value: number) => Math.round(Math.min(1, Math.max(.05, value)) * 100) / 100;
  const result: { id: string; intensity: number }[] = [];
  let weather = false;
  for (const entry of definition.model.modifications.catalog) {
    const growth = entry.kind === 'growth' ? entry.style.type : undefined;
    if (entry.kind === 'fracture') { if (rank >= 2) result.push({ id: entry.id, intensity: intensity(level * (.8 + random() * .3)) }); }
    else if (entry.kind === 'wear') { if (rank >= 1 && random() < .6) result.push({ id: entry.id, intensity: intensity(level * (.85 + random() * .3)) }); }
    else if (growth && AGEING.has(growth)) { if (random() < rank * .2) result.push({ id: entry.id, intensity: intensity(.4 + level * .6) }); }
    else if (growth && WEATHER.has(growth)) { if (!weather && random() < .15) { weather = true; result.push({ id: entry.id, intensity: intensity(.5 + random() * .5) }); } }
    else if (random() < .18) result.push({ id: entry.id, intensity: intensity(.5 + random() * .5) });
  }
  return result;
}

function lcg(seed: number) {
  let state = seed || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
