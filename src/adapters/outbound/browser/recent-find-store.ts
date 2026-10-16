import { copyItem } from '../../../domain/item.ts';
import type { RecentFind, RecentFindState } from '../../../application/ports/recent-find.ts';
import type { RouletteSession } from '../../../application/ports/roulette-session.ts';

type FindStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Records only revealed authoritative results. Each case has its own browser history key. */
export class RecentFindStore implements RecentFind {
  private state: RecentFindState = Object.freeze({ item: null });
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private readonly key: string;
  private lastSession?: string;
  private disposed = false;

  constructor(session: RouletteSession, caseId: string, storage: () => FindStorage | undefined) {
    this.key = `voxel-vault:last-find:${caseId}`;
    try {
      const saved = storage()?.getItem(this.key);
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (value && typeof value === 'object' && 'version' in value && value.version === 1 && 'item' in value) {
          this.state = Object.freeze({ item: copyItem(value.item as Parameters<typeof copyItem>[0]) });
        }
      }
    } catch { /* Missing, invalid or inaccessible history is an empty state. */ }
    const observe = () => {
      const current = session.getState();
      if (this.disposed || current.phase !== 'prize-visible' || current.sessionId === this.lastSession) return;
      this.lastSession = current.sessionId;
      this.state = Object.freeze({ item: copyItem(current.selection.prize) });
      try { storage()?.setItem(this.key, JSON.stringify({ version: 1, item: this.state.item })); } catch { /* Keep in-memory state. */ }
      for (const listener of [...this.listeners]) listener();
    };
    this.unsubscribe = session.subscribe(observe);
    observe();
  }
  readonly getState = (): RecentFindState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  };
  dispose(): void { if (this.disposed) return; this.disposed = true; this.unsubscribe(); this.listeners.clear(); }
}
