import { useCasePresentation } from './case-presentation.ts';
import { PresentationHost } from './PresentationHost.tsx';

export function RouletteScene({ active, element }: { readonly active: boolean; readonly element?: HTMLElement }) {
  const casePresentation = useCasePresentation();
  return <section className="roulette-scene" hidden={!active} aria-label="Рулетка">
    <header className="roulette-heading"><p className="eyebrow">{casePresentation.collection}</p>
      <h2>{casePresentation.title}</h2><p>Сундук открыт. Что достанется тебе?</p>
    </header>
    <PresentationHost className="game-viewport__roulette" element={element} />
    <div className="roulette-pointer" aria-hidden="true"><span /><i /><span /></div>
    <p className="roulette-caption"><span aria-hidden="true">◇</span> Твоя находка — под указателем</p>
  </section>;
}
