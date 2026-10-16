import type { CaseInstance } from '../../domain/case-instance.ts';
import type { ChestAppearance } from '../../domain/chest-appearance.ts';
import type { Item } from '../../domain/item.ts';
export interface PlayerInventory {
  getState(): readonly CaseInstance[];
  subscribe(listener: () => void): () => void;
  claim(instanceId: string, sessionId: string): void;
  complete(instanceId: string, sessionId: string, reward: Item): void;
  updateAppearance(instanceId: string, appearance: ChestAppearance): void;
}
export interface CaseOwnership { claim(sessionId: string): void; complete(sessionId: string, reward: Item): void }
