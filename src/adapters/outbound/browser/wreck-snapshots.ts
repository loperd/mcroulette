/**
 * The picture of a destroyed chest, taken once at the moment of destruction and kept per session:
 * in memory and in sessionStorage, so remounting the outcome screen or reloading the page shows
 * the same wreck instead of re-rendering a scene that may already be gone.
 */
const memory = new Map<string, string>();
const key = (sessionId: string) => `wreck:${sessionId}`;

export function saveWreck(sessionId: string, image: string | undefined): void {
  if (!image) return;
  memory.set(sessionId, image);
  try { sessionStorage.setItem(key(sessionId), image); } catch { /* quota or privacy mode: memory is enough */ }
}

export function loadWreck(sessionId: string): string | undefined {
  const cached = memory.get(sessionId);
  if (cached) return cached;
  try {
    const stored = sessionStorage.getItem(key(sessionId)) ?? undefined;
    if (stored) memory.set(sessionId, stored);
    return stored;
  } catch { return undefined; }
}
