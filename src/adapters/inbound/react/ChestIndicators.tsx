import { partConditions, resolveModifications, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import type { ChestModificationProfile } from '../../../domain/chest-modifications.ts';
import { damageLevel, integrityPercent } from '../../../application/inventory-groups.ts';

function IntegrityBubbles({ integrity, label }: { readonly integrity: number; readonly label: string }) {
  return <span className="inventory-card__damage-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={integrity}>
    {[1, 2, 3, 4].map(rank => <i key={rank} data-active={rank <= Math.ceil(integrity / 25)} />)}
  </span>;
}

export function ChestIndicators({ appearance, profile, status }: {
  readonly appearance: ChestAppearance; readonly profile: ChestModificationProfile;
  /** Stacks show their representative's exact value too: one number, no ranges. */
  readonly grouped?: boolean;
  readonly status?: 'available' | 'opening' | 'opened' | 'destroyed';
}) {
  // Parts and labels come from the model profile: each model reports its own condition rows.
  const conditions = partConditions(appearance, profile);
  const wear = damageLevel(Math.max(0, ...conditions.map(item => item.value)));
  const features = resolveModifications(appearance, profile).filter(item => item.definition.kind !== 'fracture');
  const percentage = (value: number) => `${integrityPercent(value)}%`;
  return <div className="chest-indicators">
    <div className="chest-indicators__wear" data-severity={wear.rank}><span>{wear.label}</span>
      <IntegrityBubbles integrity={integrityPercent(Math.max(0, ...conditions.map(item => item.value)))} label="Общая сохранность сундука" />
    </div>
    <div className="chest-damage-list" aria-label="Сохранность сундука">{conditions.map(({ part, value }) => {
      const level = damageLevel(value);
      return <div className="chest-damage" key={part.id} data-severity={level.rank}>
        <div className="chest-damage__label"><span>{part.label}</span><strong>{percentage(value)}</strong></div>
        <IntegrityBubbles integrity={integrityPercent(value)} label={`Сохранность: ${part.label}`} />
      </div>;
    })}</div>
    {features.length > 0 && <p className="chest-indicators__features"><span>Особенности</span> {features.map(item => item.definition.label).join(' · ')}</p>}
    {status && <p className="chest-indicators__status"><span>Состояние</span> {status === 'available' ? 'Готов к открытию' : status === 'opening' ? 'Открывается' : status === 'destroyed' ? 'Разрушен' : 'Открыт'}</p>}
  </div>;
}
