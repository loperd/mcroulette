import { useSyncExternalStore } from 'react';

interface ObservableState<State> {
  getState(): State;
  subscribe(listener: () => void): () => void;
}

export function useObservableState<State>(source: ObservableState<State>): State {
  return useSyncExternalStore(source.subscribe, source.getState, source.getState);
}
