import { ChestBackdrop } from './ChestBackdrop.tsx';
import { PresentationHost } from './PresentationHost.tsx';

export function ChestScene({ active, portalVisible, element }: {
  readonly active: boolean; readonly portalVisible: boolean; readonly element?: HTMLElement;
}) {
  return <section className="chest-scene" hidden={!active} aria-label="Падение и открытие сундука">
    <ChestBackdrop visible={active && portalVisible} />
    <PresentationHost className="game-viewport__scene" element={element} />
  </section>;
}
