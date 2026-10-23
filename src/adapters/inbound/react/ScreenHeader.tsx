import type { Navigation, ScreenRoute } from '../../../application/ports/navigation.ts';
import type { SoundPreference } from './SoundControl.tsx';
import { SoundControl } from './SoundControl.tsx';
import { BrandMark } from './BrandMark.tsx';
import { ProfileChip, WalletChip } from './AccountContext.tsx';

type Section = 'inventory' | 'archive' | 'catalog' | 'wallet';

const LINKS: readonly { readonly id: Section; readonly label: string; readonly route: ScreenRoute }[] = [
  { id: 'inventory', label: 'Инвентарь', route: { screen: 'inventory' } },
  { id: 'catalog', label: 'Все кейсы', route: { screen: 'catalog' } },
  { id: 'archive', label: 'Архив', route: { screen: 'archive' } },
  { id: 'wallet', label: 'Кошелёк', route: { screen: 'wallet' } },
];

export function ScreenHeader({ navigation, active, archiveCount, soundPreference }: {
  readonly navigation?: Navigation;
  readonly active: Section;
  readonly archiveCount?: number;
  readonly soundPreference?: SoundPreference;
}) {
  return <header className="screen-header">
    <a className="screen-header__brand" aria-label="Voxel Vault" href="#/inventory" onClick={event => {
      if (!navigation) return;
      event.preventDefault();
      navigation.go({ screen: 'inventory' });
    }}><span className="screen-header__mark"><BrandMark /></span><img className="screen-header__wordmark" src="/images/voxel-vault-wordmark.png" alt="Voxel Vault" /></a>
    <nav className="screen-header__nav" aria-label="Разделы">
      {LINKS.map(link => <button key={link.id} type="button" aria-current={active === link.id ? 'page' : undefined}
        onClick={() => navigation?.go(link.route)}>{link.label}{link.id === 'archive' && archiveCount !== undefined && <span>{archiveCount}</span>}</button>)}
    </nav>
    <div className="screen-header__tools">
      <button className="screen-header__search" type="button" aria-label="Поиск по сайту" onClick={() => window.dispatchEvent(new Event('voxel:open-search'))}>
        <span aria-hidden="true">⌕</span><span>Поиск</span><kbd>⌘K</kbd>
      </button>
      {soundPreference && <SoundControl preference={soundPreference} />}
      <WalletChip onOpenWallet={() => navigation?.go({ screen: 'wallet' })} />
      <ProfileChip />
    </div>
  </header>;
}
