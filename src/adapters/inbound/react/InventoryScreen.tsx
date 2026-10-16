import { ChestIndicators } from './ChestIndicators.tsx';
import { partConditions } from '../../../domain/chest-appearance.ts';
import { damageLevel, groupInventory } from '../../../application/inventory-groups.ts';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CASE_RARITY_LABELS, type CaseDefinition, type CaseRarity } from '../../../config/cases.ts';
import type { Navigation } from '../../../application/ports/navigation.ts';
import type { PlayerInventory } from '../../../application/ports/player-inventory.ts';
import type { ScreenStorage } from '../../outbound/browser/screen-storage.ts';
import type { ChestPreviewRenderer } from '../../outbound/chest/chest-preview-renderer.ts';
import { useObservableState } from './use-observable-state.ts';
import { ChestThumbnail } from './ChestThumbnail.tsx';

export function InventoryScreen({ inventory, cases, navigation, storage, renderer, onAddDemo, mode = 'inventory' }: {
  readonly mode?: 'inventory' | 'archive';
  readonly inventory: PlayerInventory; readonly cases: readonly CaseDefinition[]; readonly navigation: Navigation;
  readonly storage: ScreenStorage; readonly renderer: Pick<ChestPreviewRenderer, 'render'>; readonly onAddDemo: () => void;
}) {
  const instances = useObservableState(inventory);
  const saved = useRef(storage.read(mode === 'archive' ? 'screen:archive' : 'screen:inventory', value => {
    const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return { query: typeof v.query === 'string' ? v.query.slice(0, 100) : '',
      rarity: typeof v.rarity === 'string' && ['common','uncommon','rare','epic','legendary'].includes(v.rarity) ? v.rarity : 'all',
      density: v.density === 'compact' ? 'compact' : 'comfortable',
      filter: ['all', 'available', 'opened'].includes(String(v.filter)) ? String(v.filter) : 'all',
      scroll: typeof v.scroll === 'number' && v.scroll >= 0 && v.scroll < 1_000_000 ? v.scroll : 0 };
  }));
  const [query, setQuery] = useState(saved.current?.query ?? '');
  const [rarity, setRarity] = useState<string>(saved.current?.rarity ?? 'all');
  const [density, setDensity] = useState(saved.current?.density ?? 'comfortable');
  const page = useRef<HTMLElement>(null);
  useEffect(() => { if (page.current) page.current.scrollTop = saved.current?.scroll ?? 0; }, []);
  useEffect(() => {
    const element = page.current!;
    const save = () => storage.write(mode === 'archive' ? 'screen:archive' : 'screen:inventory', { query, rarity, density, scroll: element.scrollTop });
    save(); element.addEventListener('scroll', save, { passive: true });
    return () => { save(); element.removeEventListener('scroll', save); };
  }, [storage, query, rarity, density, mode]);
  const available = instances.filter(item => item.status === 'available');
  const screenInstances = instances.filter(item => mode === 'archive' ? item.status === 'opened' : item.status !== 'opened');
  const visible = screenInstances.filter(item => (!rarity || rarity === 'all' || cases.find(def => def.id === item.caseId)?.rarity === rarity)
    && `${cases.find(def => def.id === item.caseId)?.presentation.title ?? ''} ${item.id}`.toLowerCase().includes(query.toLowerCase().trim()));
  const groups = groupInventory(visible);
  const rarities = [...new Set(cases.map(definition => definition.rarity))] as CaseRarity[];
  return <main className={`inventory inventory--${density} inventory--${mode}`} ref={page}><div className="inventory__content">
    <header className="inventory__header"><span className="inventory__brand"><span aria-hidden="true">◇</span> Voxel Vault</span>
      <nav aria-label="Разделы">{mode === 'archive' ? <button type="button" onClick={() => navigation.go({ screen: 'inventory' })}>Инвентарь</button> : <span aria-current="page">Инвентарь</span>}
        {mode !== 'archive' && <button type="button" onClick={() => navigation.go({ screen: 'archive' })}>Архив <span>{instances.filter(item => item.status === 'opened').length}</span></button>}
        {mode === 'archive' && <span aria-current="page">Архив</span>}
        <button type="button" onClick={() => navigation.go({ screen: 'catalog' })}>Все кейсы</button></nav>
    </header>
    <div className="inventory__intro"><div><p className="eyebrow">{mode === 'archive' ? 'Открытия и награды' : 'Твои находки. Твои истории.'}</p><h1>{mode === 'archive' ? 'Архив' : 'Инвентарь'} <span>{mode === 'archive' ? screenInstances.length : available.length}</span></h1>
      <p>{mode === 'archive' ? 'Открытые сундуки и найденные в них предметы.' : 'Сундуки собраны по типу, окраске, повреждениям и состоянию.'}</p></div>
      {mode === 'inventory' && <div className="inventory__demo"><span>Демо-инвентарь</span><button type="button" onClick={onAddDemo}>+ Добавить кейс</button></div>}
    </div>
    <nav className="inventory__rarities" aria-label="Редкость сундука">
      <button type="button" aria-pressed={rarity === 'all'} onClick={() => setRarity('all')}>Все классы</button>
      {rarities.map(value => <button type="button" key={value} className={`case-rarity case-rarity--${value}`} aria-pressed={rarity === value} onClick={() => setRarity(value)}>{CASE_RARITY_LABELS[value]}<span>{screenInstances.filter(instance => cases.find(def => def.id === instance.caseId)?.rarity === value).length}</span></button>)}
    </nav>
    <div className="inventory__toolbar"><div className="inventory__tools"><button type="button" className="inventory__density" aria-pressed={density === 'compact'} onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}>{density === 'compact' ? 'Крупные карточки' : 'Компактный вид'}</button><label><span className="visually-hidden">Поиск по инвентарю</span><input type="search" placeholder="Найти сундук…" value={query} onChange={event => setQuery(event.target.value)} /></label></div></div>
    <section className="inventory__grid" aria-label="Мои сундуки">
      {groups.map(group => {
        const instance = group.representative;
        const definition = cases.find(value => value.id === instance.caseId);
        if (!definition) return null;
        const profile = definition.model.modifications;
        const condition = damageLevel(Math.max(0, ...partConditions(instance.appearance, profile).map(item => item.value)));

        return <article className={`inventory-card inventory-card--${instance.status}`} key={group.key}
          style={{ '--chest-color': instance.appearance.palette.panel, '--chest-accent': instance.appearance.palette.accent } as CSSProperties}>
          <div className="inventory-card__top"><span><i className={`case-rarity-mark case-rarity-mark--${definition.rarity}`} />{definition.presentation.collection} <small className={`case-rarity-label case-rarity-label--${definition.rarity}`}>{CASE_RARITY_LABELS[definition.rarity]}</small></span><span className="inventory-card__quantity">{group.instances.length} <small>шт.</small></span></div>
          <button type="button" className="inventory-card__inspect" aria-label={`Осмотреть ${definition.presentation.title}, ${condition.label}, ${group.instances.length} шт.`}
            onClick={() => navigation.go({ screen: 'case', caseId: instance.caseId, instanceId: instance.id })}>
            <ChestThumbnail renderer={renderer} definition={definition} appearance={instance.appearance} />
          </button>
          <div className="inventory-card__info"><span className="inventory-card__condition"><i style={{ background: instance.appearance.palette.panel }} />{condition.label}</span>
            <h2>{definition.presentation.title}</h2>
            <ChestIndicators appearance={instance.appearance} profile={profile} grouped />
            <div className="inventory-card__footer"><span>{instance.status === 'opening' ? 'Открывается' : instance.status === 'opened' ? 'Открыт' : 'Готов к открытию'}</span><span aria-hidden="true">↗</span></div>
            {instance.reward && <p className="inventory-card__reward">{group.instances.length === 1 ? `Найдено: ${instance.reward.title}` : `Наград получено: ${group.instances.length}`}</p>}
          </div>
        </article>;
      })}
    </section>
    {visible.length === 0 && <div className="inventory__empty"><span aria-hidden="true">◇</span><h2>{visible.length === 0 && query ? 'Ничего не найдено' : mode === 'archive' ? 'Архив пока пуст' : (rarity !== 'all' ? `В классе ${CASE_RARITY_LABELS[rarity as CaseRarity]} пока пусто` : 'Здесь начнётся твоя коллекция')}</h2><p>{mode === 'archive' ? 'Открытые сундуки и награды будут храниться здесь.' : 'Кейсы, которые ты найдёшь или приобретёшь, появятся здесь.'}</p></div>}
  </div></main>;
}
