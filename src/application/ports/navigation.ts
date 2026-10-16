export type ScreenRoute =
  | { readonly screen: 'catalog' }
  | { readonly screen: 'inventory' }
  | { readonly screen: 'archive' }
  | { readonly screen: 'case'; readonly caseId: string; readonly instanceId?: string }
  | { readonly screen: 'item'; readonly caseId: string; readonly instanceId?: string; readonly itemId: string }
  | { readonly screen: 'opening' | 'reward'; readonly caseId: string; readonly instanceId?: string; readonly sessionId: string }
  | { readonly screen: 'not-found' };

export interface Navigation {
  getState(): ScreenRoute;
  subscribe(listener: () => void): () => void;
  go(route: ScreenRoute, replace?: boolean): void;
}
