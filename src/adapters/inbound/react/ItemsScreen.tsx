import { useEffect, useState } from 'react';
import { canAfford, CURRENCY, isDamaged, type Amount, type OwnedItem } from '../../../domain/owned-item.ts';
import type { Navigation } from '../../../application/ports/navigation.ts';
import type { PlayerItems, WorkshopAction } from '../../../application/ports/player-items.ts';
import { ITEM_STATE_LABELS, RESOURCES, resourceGlyph, resourceTitle } from '../../../config/resources.ts';
import { rarityLabels } from './ItemDetails.tsx';
import { ScreenHeader } from './ScreenHeader.tsx';
import { InventoryTabs } from './InventoryTabs.tsx';
import type { SoundPreference } from './SoundControl.tsx';
import { useObservableState } from './use-observable-state.ts';

type Filter = 'all' | 'damaged';
type Pending = { readonly id: string; readonly action: WorkshopAction | 'merge' };

const amountText = (amount: Amount) => `${amount.value} ${resourceTitle(amount.resource)}`;

/** The resources to show: currency first, then every known material, then any the server added. */
function walletResources(balances: Readonly<Record<string, number>>, items: readonly OwnedItem[]): readonly string[] {
  const used = new Set([CURRENCY, ...Object.keys(RESOURCES), ...Object.keys(balances)]);
  for (const item of items) if (item.offers) used.add(item.offers.salvage.resource);
  return [...used];
}

/**
 * The player's items and wallet. A damaged item can be repaired one step for its collection's
 * material, merged with the twin the server pairs it with, salvaged for material or sold for coins. Salvage and sale
 * destroy the item, so they ask once more. Every price is the server's; the list is the
 * server's after every action.
 */
export function ItemsScreen({ items, navigation, archiveCount, chestCount, soundPreference }: {
  readonly items: PlayerItems; readonly navigation: Navigation; readonly chestCount?: number;
  readonly archiveCount?: number; readonly soundPreference?: SoundPreference;
}) {
  const state = useObservableState(items);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState<Pending>();
  const [busy, setBusy] = useState<Pending>();
  const [notice, setNotice] = useState<{ readonly text: string; readonly failed?: boolean }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    items.load(controller.signal).then(() => setFailed(false), () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [items]);

  const run = async (pending: Pending, act: () => Promise<string>) => {
    setConfirm(undefined); setBusy(pending); setNotice(undefined);
    try { setNotice({ text: await act() }); }
    catch { setNotice({ text: 'Сервер не принял действие. Список обновлён — попробуй ещё раз.', failed: true }); }
    finally { setBusy(undefined); }
  };
  const work = (item: OwnedItem, action: WorkshopAction) => {
    if ((action === 'salvage' || action === 'sell') && (confirm?.id !== item.id || confirm.action !== action)) { setConfirm({ id: item.id, action }); return; }
    void run({ id: item.id, action }, async () => {
      const amount = await items.work(item.id, action);
      return action === 'repair' ? `${item.item.title}: починено за ${amountText(amount)}`
        : `${item.item.title}: ${action === 'sell' ? 'продано' : 'разобрано'}, +${amountText(amount)}`;
    });
  };
  const merge = (item: OwnedItem, twin: string) => void run({ id: item.id, action: 'merge' }, async () => {
    const result = await items.merge(item.id, twin);
    return `${item.item.title}: объединено, ${result.mended ? `предмет стал «${ITEM_STATE_LABELS[result.kept.state]}»` : 'починить не удалось'}`;
  });

  const visible = state.items.filter(item => filter === 'all' || isDamaged(item));
  const damagedCount = state.items.filter(isDamaged).length;
  return <main className="page-shell inventory items-screen"><div className="inventory__content page-container">
    <ScreenHeader navigation={navigation} active="inventory" archiveCount={archiveCount} soundPreference={soundPreference} />
    <div className="inventory__intro"><div><p className="eyebrow">Твои находки. Твои истории.</p><h1>Инвентарь</h1>
      <p>Повреждённое можно починить материалом своей коллекции, объединить с таким же, разобрать на материал или продать.</p></div>
    </div>
    <InventoryTabs navigation={navigation} active="items" chests={chestCount} items={state.items.length} />
    <section className="wallet" aria-label="Кошелёк">
      {walletResources(state.balances, state.items).map(id => <div key={id} className={`wallet__entry${id === CURRENCY ? ' wallet__entry--currency' : ''}`}>
        <span aria-hidden="true">{resourceGlyph(id)}</span><span>{resourceTitle(id)}</span><strong>{state.balances[id] ?? 0}</strong>
      </div>)}
    </section>
    <div className="inventory__toolbar"><nav aria-label="Состояние предмета">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Все</button>
      <button type="button" aria-pressed={filter === 'damaged'} onClick={() => setFilter('damaged')}>Повреждённые <span>{damagedCount}</span></button>
    </nav></div>
    <p className={`items-screen__notice${notice?.failed ? ' items-screen__notice--failed' : ''}`} role="status" aria-live="polite">{notice?.text}</p>
    {!state.loaded && !failed && <div className="feedback" role="status"><span className="loader" aria-hidden="true" /><p>Читаем предметы…</p></div>}
    {failed && !state.loaded && <div className="inventory__empty"><h2>Предметы недоступны</h2><p>Не удалось связаться с сервером.</p></div>}
    <section className="inventory__grid items-grid" aria-label="Мои предметы">
      {visible.map(item => {
        const offers = item.offers, twin = offers?.mergeWith;
        const disabled = !!busy;
        const asking = (action: WorkshopAction) => confirm?.id === item.id && confirm.action === action;
        return <article key={item.id} className={`item-card item-card--${item.item.rarity} item-card--${item.state}`} aria-busy={busy?.id === item.id || undefined}>
          <div className="item-card__top"><span className={`item-card__rarity`}>{rarityLabels[item.item.rarity]}</span>
            <span className={`item-card__state item-card__state--${item.state}`}>{ITEM_STATE_LABELS[item.state]}</span></div>
          <div className="item-card__art"><img src={item.item.image} alt="" /></div>
          <h2>{item.item.title}</h2>
          {offers ? <div className="item-card__actions">
            {offers.repair && <button type="button" disabled={disabled || !canAfford(state.balances, offers.repair)} onClick={() => work(item, 'repair')}
              title={canAfford(state.balances, offers.repair) ? undefined : `Нужно ${amountText(offers.repair)}`}>
              Починить <small>−{amountText(offers.repair)}</small></button>}
            {twin && <button type="button" disabled={disabled} onClick={() => merge(item, twin)}>
              Объединить <small>шанс починки {offers.mergeRepair}%</small></button>}
            <button type="button" className={asking('salvage') ? 'item-card__confirm' : undefined} disabled={disabled} onClick={() => work(item, 'salvage')}>
              {asking('salvage') ? 'Точно разобрать?' : 'Разобрать'} <small>+{amountText(offers.salvage)}</small></button>
            <button type="button" className={asking('sell') ? 'item-card__confirm' : undefined} disabled={disabled} onClick={() => work(item, 'sell')}>
              {asking('sell') ? 'Точно продать?' : 'Продать'} <small>+{amountText(offers.sell)}</small></button>
          </div> : <p className="item-card__retired">Этого предмета больше нет в правилах — с ним ничего не сделать.</p>}
        </article>;
      })}
    </section>
    {state.loaded && visible.length === 0 && <div className="inventory__empty"><span aria-hidden="true">◇</span>
      <h2>{filter === 'damaged' ? 'Повреждённых предметов нет' : 'Предметов пока нет'}</h2>
      <p>{filter === 'damaged' ? 'Всё целое.' : 'Открой сундук — найденное появится здесь.'}</p></div>}
  </div></main>;
}
