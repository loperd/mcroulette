import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Player } from '../../../application/ports/auth-gateway.ts';
import type { ItemsState, PlayerItems } from '../../../application/ports/player-items.ts';
import { CURRENCY } from '../../../domain/owned-item.ts';
import { resourceGlyph, resourceTitle } from '../../../config/resources.ts';
import { useObservableState } from './use-observable-state.ts';

/** The signed-in player and their wallet, for the header of every screen. */
export interface Account {
  readonly player: Player;
  readonly items: PlayerItems;
  signOut(): void;
}

export const AccountContext = createContext<Account | undefined>(undefined);

const NOTHING: ItemsState = Object.freeze({ loaded: false, items: [], balances: {} });
const NO_ITEMS = { getState: () => NOTHING, subscribe: () => () => {} };

/** Coins in the header; pressing them shows every balance and the way to the items. */
export function WalletChip({ onOpenItems }: { readonly onOpenItems: () => void }) {
  const account = useContext(AccountContext);
  const { loaded, balances } = useObservableState(account?.items ?? NO_ITEMS);
  const [open, setOpen] = useOutsideClose();
  if (!account) return null;
  const resources = Object.keys(balances).filter(id => id !== CURRENCY && balances[id]! > 0);
  return <div className="header-popover" ref={open.ref}>
    <button type="button" className="header-chip header-chip--wallet" aria-expanded={open.value} aria-label={`Монеты: ${balances[CURRENCY] ?? 0}`}
      onClick={() => setOpen(!open.value)}>
      <span aria-hidden="true">{resourceGlyph(CURRENCY)}</span><strong>{loaded ? balances[CURRENCY] ?? 0 : '…'}</strong>
    </button>
    {open.value && <div className="header-popover__panel" role="dialog" aria-label="Кошелёк">
      <dl className="header-wallet">
        <div><dt><span aria-hidden="true">{resourceGlyph(CURRENCY)}</span> {resourceTitle(CURRENCY)}</dt><dd>{balances[CURRENCY] ?? 0}</dd></div>
        {resources.map(id => <div key={id}><dt><span aria-hidden="true">{resourceGlyph(id)}</span> {resourceTitle(id)}</dt><dd>{balances[id]}</dd></div>)}
      </dl>
      {resources.length === 0 && <p className="header-popover__hint">Материалы дают разобранные предметы.</p>}
      <button type="button" className="header-popover__action" onClick={() => { setOpen(false); onOpenItems(); }}>К предметам</button>
    </div>}
  </div>;
}

/** The player's name in the header; pressing it shows who is signed in and the way out. */
export function ProfileChip() {
  const account = useContext(AccountContext);
  const [open, setOpen] = useOutsideClose();
  if (!account) return null;
  const { player } = account;
  return <div className="header-popover" ref={open.ref}>
    <button type="button" className="header-chip header-chip--profile" aria-expanded={open.value} onClick={() => setOpen(!open.value)}>
      <span className="header-chip__avatar" aria-hidden="true">{[...player.displayName][0]?.toUpperCase() ?? '?'}</span><span className="header-chip__name">{player.displayName}</span>
    </button>
    {open.value && <div className="header-popover__panel" role="dialog" aria-label="Профиль">
      <p className="header-profile__name">{player.displayName}</p>
      <p className="header-profile__handle">@{player.handle}</p>
      <button type="button" className="header-popover__action" onClick={() => { setOpen(false); account.signOut(); }}>Выйти</button>
    </div>}
  </div>;
}

/** Open state that closes on a click outside or on Escape. */
function useOutsideClose() {
  const [value, set] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!value) return;
    const close = (event: Event) => { if (!(event.target instanceof Node) || !ref.current?.contains(event.target)) set(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); set(false); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape, true); };
  }, [value]);
  return [{ value, ref }, set] as const;
}
