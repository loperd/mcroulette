import type { BreakMoment } from '../../domain/chest-breakage.ts';
import type { Item } from '../../domain/item.ts';

/** What an opening ends in, as the server decided it: a prize, or the chest broke (and when). */
export type ChestOutcome = { readonly prize: Item } | { readonly destroyed: BreakMoment };

export interface OutcomeGateway {
  /** The same session always gets the same outcome, so a retry after a lost response is safe. */
  decide(sessionId: string, signal: AbortSignal): Promise<ChestOutcome>;
}
