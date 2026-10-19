/**
 * The picture of a destroyed chest, taken once at the moment of destruction and kept per session
 * in memory, so remounting the outcome screen shows the same wreck instead of re-rendering a scene
 * that may already be gone. Nothing about chests goes to browser storage.
 */
const memory = new Map<string, string>();

export function saveWreck(sessionId: string, image: string | undefined): void {
  if (image) memory.set(sessionId, image);
}

export function loadWreck(sessionId: string): string | undefined {
  return memory.get(sessionId);
}
