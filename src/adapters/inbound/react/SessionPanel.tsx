import type { CaseInstance } from '../../../domain/case-instance.ts';
import { useEffect, useRef } from 'react';
import type { Item } from '../../../domain/item.ts';
import type { RouletteSession } from '../../../application/ports/roulette-session.ts';
import type { SessionState } from '../../../application/session-state.ts';
import type { RecentFind } from '../../../application/ports/recent-find.ts';
import { IntroScene } from './IntroScene.tsx';
import { PrizeScene } from './PrizeScene.tsx';
import { DestroyedScene } from './DestroyedScene.tsx';
import { Button } from './Button.tsx';
import { ErrorNotice } from './ErrorNotice.tsx';
import { useObservableState } from './use-observable-state.ts';

const PHASE_LABELS: Record<SessionState['phase'], string> = {
  idle: 'Готовим сундук…', loading: 'Готовим сундук…', ready: 'Сундук готов',
  opening: 'Открываем сундук…', spinning: 'Выбираем награду…', settling: 'Награда выбрана',
  clearing: 'Готовим открытие…', dropping: 'Сундук падает…', flashing: 'Открываем награду…',
  revealing: 'Показываем награду…', 'prize-visible': 'Ваша награда', destroyed: 'Сундук разрушен',
  resetting: 'Готовим новый сундук…', failed: 'Не удалось открыть сундук', disposed: '',
};

export function SessionPanel({ session, items, onOpenGesture, recentFind, onOpenRequest, onPrizeClose, openLabel, availableCaseCount, inspectedCase, captureWreck }: {
  readonly captureWreck?: () => string | undefined;
  readonly onOpenRequest?: () => void;
  readonly onPrizeClose?: () => void;
  readonly openLabel?: string;
  readonly availableCaseCount?: number;
  readonly inspectedCase?: CaseInstance;
  readonly recentFind?: RecentFind;
  readonly session: RouletteSession;
  readonly items: readonly Item[];
  readonly onOpenGesture?: () => void;
}) {
  const state = useObservableState(session);
  const actionButton = useRef<HTMLButtonElement>(null);
  const previousPhase = useRef(state.phase);
  useEffect(() => {
    if (state.phase === 'prize-visible' || state.phase === 'destroyed'
        || state.phase === 'ready' && ['resetting', 'prize-visible', 'destroyed', 'failed'].includes(previousPhase.current)) {
      actionButton.current?.focus();
    }
    previousPhase.current = state.phase;
  }, [state.phase]);

  if (state.phase === 'disposed') return null;
  if (state.phase === 'ready' || state.phase === 'clearing' || state.phase === 'resetting') {
    return (
      <IntroScene inspectedCase={inspectedCase} availableCaseCount={availableCaseCount} openLabel={openLabel} recentFind={recentFind} items={items} phase={state.phase} actionRef={actionButton}
        onOpen={() => { onOpenGesture?.(); if (onOpenRequest) onOpenRequest(); else void session.openChest(); }} />
    );
  }
  if (state.phase === 'failed') {
    return (
      <ErrorNotice title="Не удалось подготовить сундук" actions={<>
        <Button onClick={() => { void session.retry(); }}>Повторить</Button>
        {state.failure.recovery !== 'initialize' && (
          <Button variant="transparent"
            onClick={() => { void session.resetAfterError(); }}>Вернуться к сундуку</Button>
        )}
      </>}>
        <p>Сундук и награды на месте — попробуйте ещё раз.</p>
      </ErrorNotice>
    );
  }
  if (state.phase === 'destroyed') {
    return (
      <DestroyedScene availableCaseCount={availableCaseCount} returnLabel={onPrizeClose ? 'К сундуку' : undefined} actionRef={actionButton} captureWreck={captureWreck}
        onClose={() => { if (onPrizeClose) onPrizeClose(); else void session.closePrize(); }} />
    );
  }
  if (state.phase === 'prize-visible') {
    return (
      <PrizeScene availableCaseCount={availableCaseCount} returnLabel={onPrizeClose ? 'К сундуку' : undefined} prize={state.selection.prize} actionRef={actionButton} onClose={() => { if (onPrizeClose) onPrizeClose(); else void session.closePrize(); }} />
    );
  }
  return <p className="scene-status" role="status" aria-live="polite">{PHASE_LABELS[state.phase]}</p>;
}
