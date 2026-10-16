import type { CaseInstance } from '../domain/case-instance.ts';

export function integrityPercent(damage: number): number { return Math.max(0, 100 - Math.ceil(damage * 100)); }

export function damageLevel(value: number) {
  const rank = value === 0 ? 0 : Math.min(4, Math.ceil(value * 4));
  return { rank, label: ['Нетронутый', 'Лёгкий износ', 'Потёртый', 'Повреждённый', 'Расколотый'][rank]! };
}

/** Stack by meaningful visual/lifecycle properties, preserving each owned instance. */
export function groupInventory(instances: readonly CaseInstance[]) {
  const groups = new Map<string, { key: string; instances: CaseInstance[]; representative: CaseInstance }>();
  for (const instance of instances) {
    const { palette, modifications } = instance.appearance;
    const visible = [...modifications].sort((a, b) => a.id.localeCompare(b.id)).map(item => [item.id, damageLevel(item.intensity).rank]);
    const key = JSON.stringify([instance.caseId, instance.status, palette.shell, palette.panel, palette.metal, palette.accent,
      visible, instance.reward?.id ?? null]);
    const group = groups.get(key);
    if (group) group.instances.push(instance);
    else groups.set(key, { key, instances: [instance], representative: instance });
  }
  return [...groups.values()];
}
