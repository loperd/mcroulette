import type { CaseDefinition } from '../../../config/cases.ts';
import { claimCase, completeCase, copyCaseInstance, destroyCase, type CaseInstance } from '../../../domain/case-instance.ts';
import { changeChestAppearance, copyChestAppearance, createChestAppearance, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import type { Item } from '../../../domain/item.ts';
import type { PlayerInventory } from '../../../application/ports/player-inventory.ts';
import type { ScreenStorage } from './screen-storage.ts';

/** v2: appearance schema v2 with modifications; a fresh, varied demo inventory. */
const STORAGE_KEY = 'demo-inventory-v2';

/** Local demo adapter; replace with a server inventory gateway before real ownership/issuance. */
export class DemoInventoryStore implements PlayerInventory {
  private state: readonly CaseInstance[];
  private readonly listeners = new Set<() => void>();
  private readonly storage: ScreenStorage;
  constructor(storage: ScreenStorage) {
    this.storage = storage;
    this.state = storage.read(STORAGE_KEY, value => {
      if (!Array.isArray(value) || value.length > 1000) throw new Error('Invalid inventory.');
      const items = value.map(copyCaseInstance);
      if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate instances.');
      return Object.freeze(items);
    }) ?? this.seed();
    this.storage.write(STORAGE_KEY, this.state);
  }
  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  claim(instanceId: string, sessionId: string): void { this.update(instanceId, item => claimCase(item, sessionId)); }
  complete(instanceId: string, sessionId: string, reward: Item): void { this.update(instanceId, item => completeCase(item, sessionId, reward)); }
  destroy(instanceId: string, sessionId: string): void { this.update(instanceId, item => destroyCase(item, sessionId)); }
  updateAppearance(instanceId: string, appearance: ChestAppearance): void { this.update(instanceId, item => copyCaseInstance({ ...item, appearance })); }
  /** One-time demo top-up per type; reloads must not replenish consumed cases. */
  seedDemoStock(cases: readonly CaseDefinition[], target = 100): void {
    if (!Number.isSafeInteger(target) || target < 1 || target > 1000) throw new Error('Invalid demo stock size.');
    for (const definition of cases) {
      const marker = `demo-stock:100-v2:${definition.id}`;
      if (this.storage.read(marker, value => value === true)) continue;
      const available = this.state.filter(item => item.caseId === definition.id && item.status === 'available').length;
      const additions = Array.from({ length: Math.max(0, target - available) }, (_, index) => {
        const seed = (Date.now() + index * 2654435761) >>> 0;
        // Varied stock: each chest rolls a condition and modifications, so fates differ too.
        const base = copyChestAppearance({ ...definition.appearance, seed });
        const modifications = demoModifications(definition, lcg(seed));
        const appearance = modifications.length ? changeChestAppearance(base, { modifications }) : base;
        return copyCaseInstance({ id: globalThis.crypto.randomUUID(), caseId: definition.id, status: 'available', appearance });
      });
      if (additions.length) { this.state = Object.freeze([...this.state, ...additions]); this.publish(); }
      this.storage.write(marker, true);
    }
  }
  /**
   * Demo stand-in for a server drop. The condition is rolled first and drives the look: damage
   * entries follow it, ageing growth (moss, cobweb, vines, lichen) becomes likelier on older chests;
   * weather and the End are independent rare traits.
   */
  addDemoCase(definition?: CaseDefinition, random: () => number = Math.random): void {
    const id = globalThis.crypto.randomUUID();
    const base = createChestAppearance((random() * 0x100000000) >>> 0);
    const modifications = definition ? demoModifications(definition, random) : [];
    const appearance = modifications.length ? changeChestAppearance(base, { modifications }) : base;
    this.state = Object.freeze([...this.state, copyCaseInstance({ id, caseId: definition?.id ?? 'ender', status: 'available', appearance })]);
    this.publish();
  }
  private update(id: string, action: (item: CaseInstance) => CaseInstance): void {
    const current = this.state.find(item => item.id === id);
    if (!current) throw new Error('Case does not belong to this inventory.');
    const next = action(current);
    // Idempotent transitions (claim/complete/destroy of the same session) change nothing: no
    // notification, so restoring a finished session can never feed a render loop.
    if (next === current) return;
    this.state = Object.freeze(this.state.map(item => item.id === id ? next : item)); this.publish();
  }
  private publish(): void { this.storage.write(STORAGE_KEY, this.state); for (const listener of [...this.listeners]) listener(); }
  private seed(): readonly CaseInstance[] {
    return Object.freeze([
      { id: 'demo-ender-1', appearance: createChestAppearance(731) },
      // Demo stand-ins for server-assigned modifications; each tells one coherent story.
      { id: 'demo-ender-2', appearance: changeChestAppearance(createChestAppearance(302), { palette: { shell: '#3b2e49', panel: '#574260', accent: '#b76beb' },
        modifications: [{ id: 'void-runes', intensity: .8 }, { id: 'end-crystals', intensity: .7 }] }) }, // pristine, touched by the End
      { id: 'demo-ender-3', appearance: changeChestAppearance(createChestAppearance(818), { palette: { panel: '#355e52' },
        modifications: [{ id: 'body-cracks', intensity: .7 }, { id: 'lid-cracks', intensity: .5 }, { id: 'shell-scuffs', intensity: .7 },
          { id: 'latch-rust', intensity: .9 }, { id: 'moss', intensity: .8 }, { id: 'cobweb', intensity: .7 }, { id: 'vines', intensity: .6 }] }) }, // old and battered
      { id: 'demo-ender-4', appearance: changeChestAppearance(createChestAppearance(1207), { palette: { accent: '#5ad1ff' },
        modifications: [{ id: 'shell-scuffs', intensity: .4 }, { id: 'latch-patina', intensity: .4 }, { id: 'snow', intensity: .8 }, { id: 'frost', intensity: .6 }] }) }, // worn, left out in winter
    ].map(value => copyCaseInstance({ ...value, caseId: 'ender', status: 'available' })));
  }
}

const AGEING = new Set(['moss', 'cobweb', 'vines', 'lichen']), WEATHER = new Set(['snow', 'frost']);
function demoModifications(definition: CaseDefinition, random: () => number) {
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
