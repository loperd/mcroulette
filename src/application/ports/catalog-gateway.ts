import type { Item } from '../../domain/item.ts';

export interface CatalogGateway {
  load(signal: AbortSignal): Promise<readonly Item[]>;
}
