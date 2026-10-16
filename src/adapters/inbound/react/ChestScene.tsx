import { ChestBackdrop } from './ChestBackdrop.tsx';
import { PresentationHost } from './PresentationHost.tsx';

export function ChestScene({ active, falling, element }: {
  readonly active: boolean; readonly falling: boolean; readonly element?: HTMLElement;
}) {
  return <section className="chest-scene" hidden={!active} aria-label="Падение и открытие сундука">
    <ChestBackdrop visible={active && falling} />
    <PresentationHost className="game-viewport__scene" element={element} />
  </section>;
}
