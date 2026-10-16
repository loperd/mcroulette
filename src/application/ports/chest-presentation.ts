export interface ChestPresentationPort {
  subscribeErrors?(listener: (error: unknown) => void): () => void;
  prepare(signal: AbortSignal): Promise<void>;
  preview?(signal: AbortSignal): Promise<void>;
  stageForDrop?(signal: AbortSignal): Promise<void>;
  /** Resolves after the physical body lands and settles, not when RAF starts. */
  drop(signal: AbortSignal): Promise<void>;
  open(signal: AbortSignal): Promise<void>;
  hide(): void;
  reset(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
