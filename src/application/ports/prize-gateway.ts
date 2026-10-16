import type { Item } from '../../domain/item.ts';

export interface PrizeGateway {
  select(sessionId: string, signal: AbortSignal): Promise<Item>;
}
