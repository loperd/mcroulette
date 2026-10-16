import type { Item } from '../../domain/item.ts';

export type CatalogState =
  | { readonly phase: 'idle' | 'loading' | 'disposed'; readonly items: readonly Item[] }
  | { readonly phase: 'ready'; readonly items: readonly Item[] }
  | { readonly phase: 'failed'; readonly items: readonly Item[]; readonly message: string };

export interface ItemCatalog {
  load(): Promise<void>;
  retry(): Promise<void>;
  getState(): CatalogState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
