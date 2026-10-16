import type { CaseInstance } from '../../../domain/case-instance.ts';
import type { CSSProperties } from 'react';
import type { ItemCatalog } from '../../../application/ports/item-catalog.ts';
import type { ChestPreview } from '../../../application/ports/chest-preview.ts';
import type { RouletteSession } from '../../../application/ports/roulette-session.ts';
import type { RecentFind } from '../../../application/ports/recent-find.ts';
import { Catalog } from './Catalog.tsx';
import { ChestPreviewPanel } from './ChestPreviewPanel.tsx';
import { SessionPanel } from './SessionPanel.tsx';
import { GameViewport } from './GameViewport.tsx';
import { useObservableState } from './use-observable-state.ts';
import { SoundControl, type SoundPreference } from './SoundControl.tsx';
import { Button } from './Button.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';

export function App({ captureWreck, catalog, session, preview, sceneElement, rouletteElement, transitionElement, backgroundUrl, onRetryInitialization, onOpenGesture, soundPreference, recentFind, onOpenRequest, onPrizeClose, openLabel, availableCaseCount, caseAccent, inspectedCase }: {
  readonly onOpenRequest?: () => void;
  readonly onPrizeClose?: () => void;
  readonly caseAccent?: string;
  readonly openLabel?: string;
  readonly availableCaseCount?: number;
  readonly inspectedCase?: CaseInstance;
  readonly recentFind?: RecentFind;
  readonly soundPreference?: SoundPreference;
  readonly catalog: ItemCatalog;
  readonly session?: RouletteSession;
  readonly preview?: ChestPreview;
  readonly sceneElement?: HTMLElement;
  readonly captureWreck?: () => string | undefined;
  readonly rouletteElement?: HTMLElement;
  readonly transitionElement?: HTMLElement;
  readonly onOpenGesture?: () => void;
  readonly backgroundUrl?: string;
  readonly onRetryInitialization?: () => Promise<void>;
}) {
  const state = useObservableState(catalog);
  if (state.phase === 'disposed') return null;
  return (
    <main className={session ? 'app app--game' : 'app'} style={{ ...(caseAccent ? { '--case-accent': caseAccent, '--case-effect': caseAccent } : {}), ...(backgroundUrl ? { backgroundImage:
      `radial-gradient(circle at 50% 35%, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0.55)), url("${backgroundUrl}")` } : {}) } as CSSProperties}>
      {soundPreference && <SoundControl preference={soundPreference} />}
      <div className="app__content">
        {!session && <header className="app__header">
          <p className="eyebrow">Minecraft</p>
          <h1>Voxel Vault</h1>
        </header>}
        {preview && <ChestPreviewPanel preview={preview} element={sceneElement} />}
        {session && <GameViewport session={session} scene={sceneElement} roulette={rouletteElement} transition={transitionElement} />}
        {(state.phase === 'idle' || state.phase === 'loading') && (
          <div className="feedback" role="status" aria-live="polite">
            <span className="loader" aria-hidden="true" />
            <p>Загружаем предметы…</p>
          </div>
        )}
        {state.phase === 'failed' && (
          <ErrorNotice title="Не удалось загрузить предметы" actions={<Button onClick={() => {
            void (onRetryInitialization ? onRetryInitialization() : catalog.retry());
          }}>Повторить</Button>}>
            <p>Проверьте соединение и попробуйте ещё раз.</p>
          </ErrorNotice>
        )}
        {state.phase === 'ready' && (session
          ? <SessionPanel captureWreck={captureWreck} inspectedCase={inspectedCase} availableCaseCount={availableCaseCount} onOpenRequest={onOpenRequest} onPrizeClose={onPrizeClose} openLabel={openLabel} recentFind={recentFind} session={session} items={state.items} onOpenGesture={onOpenGesture} />
          : <Catalog items={state.items} />)}
      </div>
    </main>
  );
}
