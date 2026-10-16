import type { CSSProperties, Ref } from 'react';
import type { Item } from '../../../domain/item.ts';
import { Button } from './Button.tsx';
import { useCasePresentation } from './case-presentation.ts';

const rarityPresentation = {
  default: { label: 'Обычный предмет', color: '#80b9ff' },
  primary: { label: 'Редкий предмет', color: '#c69aef' },
  legendary: { label: 'Легендарный предмет', color: '#edce8e' },
} as const;

export function PrizeScene({ prize, actionRef, onClose, availableCaseCount, returnLabel = 'Вернуться к сундуку' }: {
  readonly availableCaseCount?: number; readonly returnLabel?: string;
  readonly prize: Item; readonly actionRef: Ref<HTMLButtonElement>; readonly onClose: () => void;
}) {
  const casePresentation = useCasePresentation();
  const rarity = rarityPresentation[prize.rarity];
  return <section className={`prize prize--${prize.rarity}`} aria-labelledby="prize-title"
    style={{ '--prize-color': rarity.color } as CSSProperties}>
    <header className="prize__header"><p className="eyebrow">{casePresentation.collection}</p>
      <p className="prize__headline">Сундук раскрыл свой секрет</p>
    </header>
    <div className="prize__art">
      <div className="prize__aura" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
      <img src={prize.image} alt="" width="280" height="280" />
    </div>
    <div className="prize__details">
      <span className="prize__rarity"><span aria-hidden="true">◆</span> {rarity.label}</span>
      <p className="prize__label">Ваша награда</p>
      <h2 id="prize-title">{prize.title}</h2>
      <p className="prize__source">Из сундука «{casePresentation.title}»</p>
    </div>
    <footer className="prize__actions">
      <Button ref={actionRef} variant="transparent" onClick={onClose}>Закрыть</Button>
      <p>{returnLabel}</p>
      {availableCaseCount !== undefined && <p className="prize__remaining">Готово к открытию: {availableCaseCount} шт.</p>}
    </footer>
  </section>;
}
