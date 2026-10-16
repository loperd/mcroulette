import type { CaseInstance } from '../../../domain/case-instance.ts';
import { useEffect, useRef, useState } from 'react';
import type { CaseDefinition } from '../../../config/cases.ts';
import type { Navigation } from '../../../application/ports/navigation.ts';
import type { ScreenStorage } from '../../outbound/browser/screen-storage.ts';
import type { ChestPreviewRenderer } from '../../outbound/chest/chest-preview-renderer.ts';
import { ChestThumbnail } from './ChestThumbnail.tsx';

export function CaseDirectory({ cases, navigation, storage, renderer, instances = [] }: {
  readonly instances?: readonly CaseInstance[];
  readonly cases: readonly CaseDefinition[]; readonly navigation: Navigation; readonly storage: ScreenStorage; readonly renderer: Pick<ChestPreviewRenderer, 'render'>;
}) {
  const saved = useRef(storage.read('screen:catalog', value => {
    if (!value || typeof value !== 'object') return { query: '', collection: 'all', scroll: 0 };
    const v = value as Record<string, unknown>;
    return { query: typeof v.query === 'string' ? v.query.slice(0, 100) : '',
      collection: typeof v.collection === 'string' ? v.collection : 'all',
      scroll: typeof v.scroll === 'number' && v.scroll >= 0 && v.scroll < 1_000_000 ? v.scroll : 0 };
  }));
  const [query, setQuery] = useState(saved.current?.query ?? '');
  const [collection, setCollection] = useState(() => {
    const selected = saved.current?.collection;
    return selected && cases.some(item => item.collectionId === selected) ? selected : 'all';
  });
  const page = useRef<HTMLElement>(null);
  useEffect(() => { if (page.current) page.current.scrollTop = saved.current?.scroll ?? 0; }, []);
  useEffect(() => {
    const element = page.current!;
    const save = () => storage.write('screen:catalog', { query, collection, scroll: element.scrollTop });
    save(); element.addEventListener('scroll', save, { passive: true });
    return () => { save(); element.removeEventListener('scroll', save); };
  }, [query, collection, storage]);
  const collections = [...new Map(cases.map(item => [item.collectionId, item.presentation.collection])).entries()];
  const visible = cases.filter(item => (collection === 'all' || item.collectionId === collection)
    && `${item.presentation.title} ${item.presentation.collection}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <main ref={page} className="case-directory">
    <div className="case-directory__content">
      <header className="case-directory__brand"><button className="case-directory__back" type="button" onClick={() => navigation.go({ screen: 'inventory' })}>← Инвентарь</button><span aria-hidden="true">◇</span> Voxel Vault</header>
      <section className="case-directory__intro"><p className="eyebrow">Твоя следующая история</p>
        <h1>За каждой крышкой —<br />новое приключение.</h1>
        <p>Выбери сундук, изучи его сокровища и узнай, какая находка ждёт тебя.</p>
      </section>
      <div className="case-directory__filters">
        <nav aria-label="Коллекции сундуков"><button type="button" aria-pressed={collection === 'all'} onClick={() => setCollection('all')}>Все сундуки <span>{cases.length}</span></button>
          {collections.map(([id, title]) => <button key={id} type="button" aria-pressed={collection === id} onClick={() => setCollection(id)}>{title}</button>)}
        </nav>
        <label><span className="visually-hidden">Найти сундук</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти сундук…" /></label>
      </div>
      <div className="case-directory__grid">
        {visible.map(item => <button type="button" className="case-card" key={item.id} onClick={() => navigation.go({ screen: 'case', caseId: item.id })}>
          <div className="case-card__art"><span aria-hidden="true">◇</span><ChestThumbnail renderer={renderer} definition={item} appearance={item.appearance} /></div>
          <div className="case-card__info"><p className="eyebrow">{item.presentation.collection}</p><h2>{item.presentation.title}</h2>
            <p>{item.presentation.description}</p><p className="case-card__owned">Готово к открытию: <strong>{instances.filter(instance => instance.caseId === item.id && instance.status === 'available').length} шт.</strong></p><span className="case-card__action">Посмотреть содержимое <span aria-hidden="true">↗</span></span>
          </div>
        </button>)}
      </div>
      {visible.length === 0 && <p className="case-directory__empty" role="status">Таких сундуков пока нет. Попробуй другое название или коллекцию.</p>}
    </div>
  </main>;
}
