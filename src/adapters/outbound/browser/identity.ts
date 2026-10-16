import type { RandomSource } from '../../../domain/random-source.ts';

export const browserRandom: RandomSource = Object.freeze({ next: () => Math.random() });

export function createBrowserSessionId(): string {
  return globalThis.crypto.randomUUID();
}
