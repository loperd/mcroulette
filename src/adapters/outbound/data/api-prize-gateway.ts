import type { Item } from '../../../domain/item.ts';
import type { PrizeGateway } from '../../../application/ports/prize-gateway.ts';
import { normalizeBaseUrl, resolvePublicAsset } from './asset-url.ts';
import { decodeItem } from './item-dto.ts';
import { browserFetch, requestJson, type FetchJson } from './request-json.ts';

/**
 * The server decides the prize: POST /api/v1/cases/{id}/roll with the opening session id and the
 * player's chest being opened (the server reserves that chest for the session). The server stores
 * one roll per (session, player), so a retry after a lost response gets the same item.
 */
export class ApiPrizeGateway implements PrizeGateway {
  private readonly baseUrl: URL;
  private readonly fetcher: FetchJson;
  private readonly path: string;
  private readonly instanceId: string;

  constructor(baseUrl: string | URL, path: string, instanceId: string, fetcher: FetchJson = browserFetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetcher = fetcher; this.path = path; this.instanceId = instanceId;
  }

  async select(sessionId: string, signal: AbortSignal): Promise<Item> {
    if (!sessionId.trim()) throw new Error('The session id must be nonempty.');
    const value = await requestJson(resolvePublicAsset(this.path, this.baseUrl), signal, this.fetcher, 'no-store', { sessionId, instanceId: this.instanceId });
    signal.throwIfAborted();
    return decodeItem(value, this.baseUrl);
  }
}
