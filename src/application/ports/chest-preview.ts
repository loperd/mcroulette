export interface ChestDropPort {
  prepare(signal: AbortSignal): Promise<void>;
  drop(signal: AbortSignal): Promise<void>;
  reset(signal: AbortSignal): Promise<void>;
  subscribeErrors(listener: (error: unknown) => void): () => void;
  dispose(): void;
}

export type ChestPreviewState =
  | { readonly phase: 'idle' | 'loading' | 'ready' | 'resetting' | 'disposed' }
  | { readonly phase: 'failed'; readonly message: string };

export interface ChestPreview {
  initialize(): Promise<void>;
  replay(): Promise<void>;
  retry(): Promise<void>;
  getState(): ChestPreviewState;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
