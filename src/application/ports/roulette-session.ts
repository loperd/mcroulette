import type { SessionState } from '../session-state.ts';

/** Commands and observable snapshots available to any UI adapter. */
export interface RouletteSession {
  initialize(): Promise<void>;
  openChest(): Promise<void>;
  closePrize(): Promise<void>;
  retry(): Promise<void>;
  resetAfterError(): Promise<void>;
  getState(): SessionState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
