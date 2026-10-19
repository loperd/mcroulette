import type { CaseInstance } from '../../domain/case-instance.ts';
import type { ChestOutcome } from './outcome-gateway.ts';

export interface PlayerInventory {
  getState(): readonly CaseInstance[];
  subscribe(listener: () => void): () => void;
  /** Claim the chest for the session and open it: the server lands it and decides the outcome. */
  open(instanceId: string, sessionId: string, signal?: AbortSignal): Promise<ChestOutcome>;
  /** Show the chest as the server left it, once the outcome has been shown to the player. */
  reveal(instanceId: string): void;
}

/** The opening session tells the owner when the outcome is on screen. */
export interface CaseOwnership { reveal(sessionId: string): void }
