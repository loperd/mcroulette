import type { ItemsState, MergeResult, PlayerItems, WorkshopAction } from '../../../application/ports/player-items.ts';
import { copyBalances, copyOwnedItem, type Amount, type OwnedItem } from '../../../domain/owned-item.ts';
import { normalizeBaseUrl, resolvePublicAsset } from './asset-url.ts';
import { DataError } from './data-error.ts';
import { decodeItem } from './item-dto.ts';
import { browserFetch, type FetchJson } from './request-json.ts';

const EMPTY: ItemsState = Object.freeze({ loaded: false, items: Object.freeze([]), balances: Object.freeze({}) });

/**
 * The player's items and wallet from the server. Prices come with the list; an action is sent,
 * then the list is read again, so the screen always shows what the server has. A refused action
 * is reported and the list read again too.
 */
export class ApiItems implements PlayerItems {
  private state: ItemsState = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly baseUrl: URL;
  private readonly fetcher: FetchJson;
  private readonly onError: (error: unknown) => void;

  constructor(baseUrl: string | URL, onError: (error: unknown) => void, fetcher: FetchJson = browserFetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl); this.onError = onError; this.fetcher = fetcher;
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  async load(signal?: AbortSignal): Promise<void> {
    const response = await this.fetcher(resolvePublicAsset('api/v1/inventory/items', this.baseUrl),
      { signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new DataError('HTTP_ERROR', `The items request failed with HTTP ${response.status}.`);
    const value = await response.json() as Record<string, unknown> | null;
    if (!value || !Array.isArray(value.items) || value.items.length > 10_000) throw new DataError('INVALID_DTO', 'The items answer needs a list of items.');
    const items = value.items.flatMap(entry => { const item = this.decode(entry); return item ? [item] : []; });
    this.state = Object.freeze({ loaded: true, items: Object.freeze(items), balances: copyBalances(value.balances ?? {}) });
    this.publish();
  }

  async work(itemId: string, action: WorkshopAction): Promise<Amount> {
    const answer = await this.act(`api/v1/inventory/items/${encodeURIComponent(itemId)}/${action}`, undefined) as Record<string, unknown>;
    if (typeof answer?.resource !== 'string' || typeof answer.value !== 'number') throw new DataError('INVALID_DTO', 'A workshop answer is an amount.');
    return Object.freeze({ resource: answer.resource, value: answer.value });
  }

  async merge(a: string, b: string): Promise<MergeResult> {
    const before = this.state.items.filter(item => item.id === a || item.id === b);
    const kept = this.decode(await this.act('api/v1/inventory/items/merge', { a, b }));
    if (!kept) throw new DataError('INVALID_DTO', 'The merge answer is not an item this client knows.');
    const was = before.find(item => item.id === kept.id);
    return Object.freeze({ kept, mended: !!was && was.state !== kept.state });
  }

  /** Send an action; the list is read again whatever the answer. */
  private async act(path: string, body: unknown): Promise<unknown> {
    try {
      const response = await this.fetcher(resolvePublicAsset(path, this.baseUrl), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', body: JSON.stringify(body ?? {}),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new DataError('HTTP_ERROR', `The item request failed with HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      this.onError(error);
      throw error;
    } finally {
      void this.load().catch(error => this.onError(error));
    }
  }

  /** An item the rulebook no longer describes (no rarity) is skipped, not fatal. */
  private decode(value: unknown): OwnedItem | undefined {
    if (!value || typeof value !== 'object') throw new DataError('INVALID_DTO', 'An item must be an object.');
    const dto = value as Record<string, unknown>;
    const described = dto.item as Record<string, unknown> | undefined;
    if (!described || typeof described.type !== 'string' || !described.type) return undefined;
    const offers = dto.offers as Record<string, unknown> | undefined;
    return copyOwnedItem({
      id: dto.id as string, item: decodeItem(described, this.baseUrl), state: dto.state as OwnedItem['state'], origin: dto.origin as string,
      ...(offers ? { offers: { ...(offers.repair ? { repair: offers.repair as Amount } : {}), salvage: offers.salvage as Amount,
        sell: offers.sell as Amount, mergeRepair: offers.mergeRepair as number,
        ...(typeof offers.mergeWith === 'string' && offers.mergeWith ? { mergeWith: offers.mergeWith } : {}) } } : {}),
    });
  }

  private publish(): void { for (const listener of [...this.listeners]) listener(); }
}
