import type { CaseDefinition } from '../../../config/cases.ts';
import { issuedAppearance } from '../../../config/issued-appearance.ts';
import { claimCase, completeCase, copyCaseInstance, destroyCase, type CaseInstance } from '../../../domain/case-instance.ts';
import { copyChestAppearance, type ChestAppearance } from '../../../domain/chest-appearance.ts';
import type { Item } from '../../../domain/item.ts';
import type { PlayerInventory } from '../../../application/ports/player-inventory.ts';
import { normalizeBaseUrl, resolvePublicAsset } from './asset-url.ts';
import { DataError } from './data-error.ts';
import { decodeItem } from './item-dto.ts';
import { browserFetch, type FetchJson } from './request-json.ts';

/**
 * The player's chests, as the server has them. The server alone issues chests and owns their
 * state; nothing about them is kept in the browser. This mirrors the server's list and asks it for
 * every change: a change shows at once, and if the server refuses it, the list is read again from
 * the server and the refusal reported. Changes to one chest go out in order.
 */
export class ApiInventory implements PlayerInventory {
  private state: readonly CaseInstance[] = Object.freeze([]);
  private loaded = false;
  private readonly listeners = new Set<() => void>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly baseUrl: URL;
  private readonly cases: readonly CaseDefinition[];
  private readonly fetcher: FetchJson;
  private readonly onError: (error: unknown) => void;

  constructor(baseUrl: string | URL, cases: readonly CaseDefinition[], onError: (error: unknown) => void, fetcher: FetchJson = browserFetch) {
    this.baseUrl = normalizeBaseUrl(baseUrl); this.cases = cases; this.onError = onError; this.fetcher = fetcher;
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  /** Has the list been read from the server at least once? */
  isLoaded(): boolean { return this.loaded; }

  /** Read the player's chests from the server (it issues the starter chests on the first read). */
  async load(signal?: AbortSignal): Promise<void> {
    const response = await this.fetcher(resolvePublicAsset('api/v1/inventory', this.baseUrl),
      { signal, cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new DataError('HTTP_ERROR', `The inventory request failed with HTTP ${response.status}.`);
    const value: unknown = await response.json();
    if (!Array.isArray(value) || value.length > 10_000) throw new DataError('INVALID_DTO', 'The inventory must be a list.');
    this.state = Object.freeze(value.flatMap(entry => { const chest = this.decode(entry); return chest ? [chest] : []; }));
    this.loaded = true;
    this.publish();
  }

  claim(instanceId: string, sessionId: string): void {
    this.change(instanceId, item => claimCase(item, sessionId), 'POST', 'claim', { sessionId });
  }

  /** The server records the reward it rolled for the session; the item is shown meanwhile. */
  complete(instanceId: string, sessionId: string, reward: Item): void {
    this.change(instanceId, item => completeCase(item, sessionId, reward), 'POST', 'complete', { sessionId });
  }

  destroy(instanceId: string, sessionId: string): void {
    this.change(instanceId, item => destroyCase(item, sessionId), 'POST', 'destroy', { sessionId });
  }

  updateAppearance(instanceId: string, appearance: ChestAppearance): void {
    const copy = copyChestAppearance(appearance);
    this.change(instanceId, item => copyCaseInstance({ ...item, appearance: copy }), 'PUT', 'appearance', { appearance: copy });
  }

  private change(id: string, action: (item: CaseInstance) => CaseInstance, method: 'POST' | 'PUT', path: string, body: unknown): void {
    const current = this.state.find(item => item.id === id);
    if (!current) throw new Error('Case does not belong to this inventory.');
    const next = action(current);
    // Idempotent transitions (the same session again) change nothing: no request, no notification.
    if (next === current) return;
    this.state = Object.freeze(this.state.map(item => item.id === id ? next : item)); this.publish();
    const previous = this.queues.get(id) ?? Promise.resolve();
    const sent = previous.then(async () => {
      const response = await this.fetcher(resolvePublicAsset(`api/v1/inventory/${encodeURIComponent(id)}/${path}`, this.baseUrl), {
        method, cache: 'no-store', credentials: 'same-origin', body: JSON.stringify(body),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new DataError('HTTP_ERROR', `The chest ${path} request failed with HTTP ${response.status}.`);
      const chest = this.decode(await response.json());
      if (chest) { this.state = Object.freeze(this.state.map(item => item.id === id ? chest : item)); this.publish(); }
    }).catch(async error => {
      this.onError(error);
      // The server is the truth: show what it has.
      try { await this.load(); } catch (reloadError) { this.onError(reloadError); }
    });
    this.queues.set(id, sent);
    void sent.finally(() => { if (this.queues.get(id) === sent) this.queues.delete(id); });
  }

  /** A chest from the server; its look derives from the seed the server chose, unless it changed since. */
  private decode(value: unknown): CaseInstance | undefined {
    if (!value || typeof value !== 'object') throw new DataError('INVALID_DTO', 'A chest must be an object.');
    const dto = value as Record<string, unknown>;
    const definition = this.cases.find(item => item.id === dto.caseId);
    // A type this client does not know yet is skipped, not fatal.
    if (!definition) return undefined;
    if (typeof dto.seed !== 'number' || !Number.isSafeInteger(dto.seed)) throw new DataError('INVALID_DTO', 'A chest seed must be an integer.');
    const appearance = dto.appearance && typeof dto.appearance === 'object' ? copyChestAppearance(dto.appearance) : issuedAppearance(definition, dto.seed);
    return copyCaseInstance({
      id: dto.id, caseId: dto.caseId, status: dto.status, appearance,
      ...(typeof dto.sessionId === 'string' ? { sessionId: dto.sessionId } : {}),
      ...(dto.reward ? { reward: decodeItem(dto.reward, this.baseUrl) } : {}),
      ...(typeof dto.openedAt === 'string' ? { openedAt: dto.openedAt } : {}),
    });
  }

  private publish(): void { for (const listener of [...this.listeners]) listener(); }
}
