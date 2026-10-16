export interface TransitionPresentationPort {
  clearContent(signal: AbortSignal): Promise<void>;
  flashToRoulette(signal: AbortSignal): Promise<void>;
  finishFlash(signal: AbortSignal): Promise<void>;
  holdStoppedStrip(signal: AbortSignal): Promise<void>;
  revealPrize(signal: AbortSignal): Promise<void>;
  resetToIntro(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
