import { caseOpenAction } from './application/case-open-action.ts';
import { parentRoute } from './application/navigation-map.ts';
import { gameAudio } from './adapters/outbound/browser/game-audio.ts';
import { ConsoleErrorReporter } from './adapters/outbound/browser/console-error-reporter.ts';
import { Failsafe } from './adapters/inbound/browser/failsafe.ts';
import { loadWreck, saveWreck } from './adapters/outbound/browser/wreck-snapshots.ts';
import { chestEffectColor } from './adapters/outbound/chest/chest-appearance.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './adapters/inbound/react/App.tsx';
import { LoginScreen } from './adapters/inbound/react/LoginScreen.tsx';
import { ErrorNotice } from './adapters/inbound/react/ErrorNotice.tsx';
import { Button } from './adapters/inbound/react/Button.tsx';
import { ApiAuthGateway } from './adapters/outbound/data/api-auth-gateway.ts';
import type { Player } from './application/ports/auth-gateway.ts';
import { InventoryScreen } from './adapters/inbound/react/InventoryScreen.tsx';
import { DemoInventoryStore } from './adapters/outbound/browser/demo-inventory-store.ts';
import { ChestPreviewRenderer } from './adapters/outbound/chest/chest-preview-renderer.ts';
import { withBreakageDamage } from './domain/chest-appearance.ts';
import { demoBreakage } from './adapters/outbound/browser/demo-breakage.ts';
import { nextOwnedCase, type CaseInstance } from './domain/case-instance.ts';
import { CaseDirectory } from './adapters/inbound/react/CaseDirectory.tsx';
import { CasePresentationContext } from './adapters/inbound/react/case-presentation.ts';
import { NavigationContext } from './adapters/inbound/react/NavigationContext.tsx';
import { SoundControl } from './adapters/inbound/react/SoundControl.tsx';
import { createApplication } from './composition/create-application.ts';
import { CASES, type CaseDefinition } from './config/cases.ts';
import { ThreeChestDropScene } from './adapters/outbound/chest/three-chest-drop-scene.ts';
import { CanvasRoulette } from './adapters/outbound/browser/canvas-roulette.ts';
import { RecentFindStore } from './adapters/outbound/browser/recent-find-store.ts';
import { SoundSettings } from './adapters/outbound/browser/sound-settings.ts';
import { ClickSound } from './adapters/outbound/browser/click-sound.ts';
import { ScreenStorage } from './adapters/outbound/browser/screen-storage.ts';
import { BrowserRouter } from './adapters/outbound/browser/browser-router.ts';
import { BrowserSessionJournal } from './adapters/outbound/browser/browser-session-journal.ts';
import { GameTransitions } from './adapters/outbound/browser/game-transitions.ts';
import { browserFrameEnvironment } from './adapters/outbound/browser/frame-scheduler.ts';
import { normalizeBaseUrl, resolvePublicAsset } from './adapters/outbound/data/asset-url.ts';
import './adapters/inbound/react/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Application root was not found.');
const root = createRoot(container);
const design = new URL(window.location.href).searchParams.get('design');
const theme = design === 'gallery' || design === 'minimal' ? design : 'ender';
document.documentElement.dataset.homeDesign = theme;
const baseUrl = normalizeBaseUrl(new URL(import.meta.env.BASE_URL, document.baseURI));
const storage = new ScreenStorage(() => window.localStorage);
const navigation = new BrowserRouter(window, storage);
// Nobody is left hanging: unexpected errors, stuck phases and render loops end in a modal with a
// way back to the main screen, and are reported (console now, Sentry later).
const reporter = new ConsoleErrorReporter();
const failsafe = new Failsafe({ document, reporter, goHome: () => navigation.go({ screen: 'inventory' }, true) });
failsafe.install();
const inventory = new DemoInventoryStore(storage);
inventory.seedDemoStock(CASES);
let previews: ChestPreviewRenderer | undefined;
let runtime: ReturnType<typeof createCaseRuntime> | undefined;
let pendingOpenInstanceId: string | undefined;
const soundPreference = new SoundSettings(() => window.localStorage,
  muted => { runtime?.sound.setMuted(muted); runtime?.scene.setSoundMuted(muted); gameAudio.setMuted(muted); },
  () => { runtime?.sound.unlock(); runtime?.scene.unlockAudio(); gameAudio.unlock(); });
gameAudio.setMuted(soundPreference.isMuted());
// Every action is heard: a tick on any button press (also unlocks audio inside the gesture).
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest('button, a, [role="button"]')) return;
  gameAudio.unlock(); gameAudio.click();
}, true);

/** Resources belong to the selected case, outside React effects and StrictMode. */
function createCaseRuntime(definition: CaseDefinition, instance?: CaseInstance) {
  const identity = `${definition.id}:${instance?.id ?? 'browse'}`;
  failsafe.noteRebuild(identity);
  const routeBase = { caseId: definition.id, ...(instance ? { instanceId: instance.id } : {}) };
  // Server stand-in: this chest's fate. The scene draws it; the session skips the roulette if it is destroyed.
  const breakage = instance ? demoBreakage(instance, definition.model.modifications) : undefined;
  const scene = new ThreeChestDropScene(baseUrl, document, definition.model, instance?.appearance ?? definition.appearance, () => {
    if (!instance) return;
    const current = inventory.getState().find(item => item.id === instance.id);
    if (!current) return;
    // Only what the decided break actually did on landing is kept; an intact chest stays intact.
    if (breakage?.moment !== 'impact' || !breakage.parts.length) return;
    const damaged = withBreakageDamage(current.appearance, definition.model.modifications, breakage.parts);
    if (damaged !== current.appearance) inventory.updateAppearance(instance.id, damaged);
  }, breakage);
  const sound = new ClickSound(resolvePublicAsset('audio/click.wav', baseUrl));
  sound.setMuted(soundPreference.isMuted()); scene.setSoundMuted(soundPreference.isMuted());
  const roulette = new CanvasRoulette(document, { sound, theme });
  const effectColor = '#' + chestEffectColor(instance?.appearance ?? definition.appearance).toString(16).padStart(6, '0');
  const transitions = new GameTransitions(browserFrameEnvironment(window, document), roulette.element);
  transitions.element.style.background = `radial-gradient(ellipse, #ffffff, ${effectColor})`;
  const journal = instance ? new BrowserSessionJournal(storage, identity) : undefined;
  if (instance?.status === 'opening' && !journal!.load()) journal!.save({ stage: 'chest', sessionId: instance.sessionId! });
  const application = createApplication({ baseUrl, catalogPath: definition.catalogPath, prizePath: definition.prizePath,
    journal, ownership: instance ? {
      claim: sessionId => inventory.claim(instance.id, sessionId),
      complete: (sessionId, reward) => inventory.complete(instance.id, sessionId, reward),
      destroy: sessionId => inventory.destroy(instance.id, sessionId),
    } : undefined, destruction: breakage?.destroyed ? { moment: breakage.moment } : undefined,
    presentation: { chest: scene, roulette, transitions } });
  const recentFind = new RecentFindStore(application.session!, definition.id, () => window.localStorage);
  let initializing = true;
  const syncRoute = () => {
    if (initializing || runtime?.identity !== identity) return;
    const state = application.session!.getState(), route = navigation.getState();
    if (!('caseId' in route) || route.caseId !== definition.id) return;
    if (state.phase === 'prize-visible') navigation.go({ screen: 'reward', ...routeBase, sessionId: state.sessionId }, true);
    else if ('sessionId' in state) navigation.go({ screen: 'opening', ...routeBase, sessionId: state.sessionId }, route.screen === 'opening' || route.screen === 'reward');
    else if (state.phase === 'ready' && (route.screen === 'opening' || route.screen === 'reward')) navigation.go({ screen: 'case', ...routeBase }, true);
  };
  // Outcome stings: the reward by its rarity, or the loss.
  let heard: string | undefined;
  const unsubscribeOutcome = application.session!.subscribe(() => {
    const state = application.session!.getState();
    const key = 'sessionId' in state ? `${state.phase}:${state.sessionId}` : state.phase;
    if (key === heard) return;
    heard = key;
    if (state.phase === 'prize-visible') gameAudio.reward(state.selection.prize.rarity);
    else if (state.phase === 'destroyed') {
      // Take the picture of the wreck once, now, and keep it for this session.
      if (!loadWreck(state.sessionId)) saveWreck(state.sessionId, scene.captureWreck());
      gameAudio.destroyed();
    }
  });
  const unwatch = failsafe.watch(application.session!, { caseId: definition.id, instanceId: instance?.id ?? null });
  const unsubscribe = () => { unwatch(); unsubscribeOutcome(); unsubscribeSync(); };
  const unsubscribeSync = application.session!.subscribe(syncRoute);
  return { identity, effectColor, instanceId: instance?.id, definition, scene, sound, roulette, transitions, application, recentFind,
    initialize() { void application.initialize().finally(() => {
      initializing = false; syncRoute();
      if (instance && pendingOpenInstanceId === instance.id && runtime?.identity === identity) {
        pendingOpenInstanceId = undefined;
        if (application.session!.getState().phase === 'ready') void application.session!.openChest();
      }
    }); },
    dispose() { unsubscribe(); recentFind.dispose(); try { application.dispose(); } finally { sound.dispose(); } },
  };
}

/**
 * Escape = back towards the inventory. Dialogs and text fields keep their own Escape; while a chest
 * is opening it does nothing; on a reward or destruction screen it closes it, landing on the case
 * overview of the same chest.
 */
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
  const target = event.target instanceof Element ? event.target : null;
  if (document.querySelector('dialog[open]') || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  const phase = runtime?.application.session?.getState().phase;
  if (phase === 'prize-visible' || phase === 'destroyed') { event.preventDefault(); void runtime!.application.session!.closePrize(); return; }
  if (phase && ['clearing', 'dropping', 'opening', 'flashing', 'spinning', 'settling', 'revealing', 'resetting'].includes(phase)) return;
  const parent = parentRoute(navigation.getState());
  if (parent) { event.preventDefault(); navigation.go(parent); }
});

/**
 * Nothing is shown before the server knows the player: the session cookie is checked first, and
 * without one the way in is the login screen (passkey or Telegram). A server that cannot be
 * reached is said plainly, with a retry, instead of an app that fails piece by piece.
 */
const auth = new ApiAuthGateway(baseUrl);
let session: { readonly state: 'checking' } | { readonly state: 'signed-out' | 'unavailable' } | { readonly state: 'signed-in'; readonly player: Player } = { state: 'checking' };
async function checkSession() {
  session = { state: 'checking' }; renderRoute();
  try {
    const player = await auth.current();
    session = player ? { state: 'signed-in', player } : { state: 'signed-out' };
  } catch (error) {
    reporter.capture(error, { code: 'SESSION_CHECK_FAILED' });
    session = { state: 'unavailable' };
  }
  renderRoute();
}
function renderGate(): boolean {
  if (session.state === 'signed-in') return false;
  root.render(<StrictMode>{session.state === 'signed-out'
    ? <LoginScreen auth={auth} onSignedIn={player => { session = { state: 'signed-in', player }; renderRoute(); }} />
    : <main className="page-shell">{session.state === 'unavailable'
      ? <ErrorNotice eyebrow="Нет связи с сервером" title="Хранилище недоступно" actions={<Button onClick={() => { void checkSession(); }}>Повторить</Button>}>
          <p>Не удалось связаться с сервером. Проверьте соединение — сундуки и награды хранятся на сервере и никуда не денутся.</p>
        </ErrorNotice>
      : <div className="feedback" role="status" aria-live="polite"><span className="loader" aria-hidden="true" /><p>Открываем хранилище…</p></div>}</main>}
  </StrictMode>);
  return true;
}

function renderRoute() {
  if (renderGate()) return;
  const route = navigation.getState();
  if (route.screen === 'case' && !route.instanceId) {
    const owned = nextOwnedCase(inventory.getState(), route.caseId);
    if (owned) { navigation.go({ ...route, instanceId: owned.id }, true); return; }
  }
  if (pendingOpenInstanceId && (!('instanceId' in route) || route.instanceId !== pendingOpenInstanceId)) pendingOpenInstanceId = undefined;
  const requestedInstance = 'instanceId' in route ? route.instanceId : undefined;
  const instance = requestedInstance ? inventory.getState().find(item => item.id === requestedInstance) : undefined;
  const definition = 'caseId' in route && (!requestedInstance || instance?.caseId === route.caseId)
    ? CASES.find(item => item.id === route.caseId) : undefined;
  const identity = definition ? `${definition.id}:${instance?.id ?? 'browse'}` : undefined;
  if (route.screen !== 'inventory' && route.screen !== 'archive' && route.screen !== 'catalog') { previews?.dispose(); previews = undefined; }
  if (runtime && runtime.identity !== identity) { const previous = runtime; runtime = undefined; previous.dispose(); }
  let fresh = false;
  if (definition && !runtime) { runtime = createCaseRuntime(definition, instance); fresh = true; }
  // Dev-only handle for inspecting the live scene from the browser console.
  if (import.meta.env.DEV) (window as unknown as { __caseRuntime?: unknown }).__caseRuntime = runtime;
  if (!definition) {
    if (route.screen === 'inventory' || route.screen === 'archive' || route.screen === 'catalog') previews ??= new ChestPreviewRenderer(document, baseUrl);
    root.render(<StrictMode><SoundControl preference={soundPreference} />{route.screen === 'inventory' || route.screen === 'archive'
      ? <InventoryScreen key={route.screen} mode={route.screen} inventory={inventory} cases={CASES} navigation={navigation} storage={storage} renderer={previews!} />
      : route.screen === 'catalog'
      ? <CaseDirectory instances={inventory.getState()} cases={CASES} navigation={navigation} storage={storage} renderer={previews!} />
      : <main className="case-directory"><div className="feedback"><h1>Сундук не найден</h1><p>Возможно, ссылка устарела.</p>
        <button className="btn btn-transparent" onClick={() => navigation.go({ screen: 'inventory' }, true)}>К сундукам</button></div></main>}</StrictMode>);
    return;
  }
  const current = runtime!;
  const action = caseOpenAction(inventory.getState(), definition.id, current.instanceId);
  const state = current.application.session!.getState();
  if (!fresh && route.screen === 'case' && state.phase === 'prize-visible') void current.application.session!.closePrize();
  root.render(<StrictMode><NavigationContext.Provider value={{ navigation, storage }}>
    <CasePresentationContext.Provider value={definition.presentation}>
      <App captureWreck={() => { const state = current.application.session!.getState(); return 'sessionId' in state ? loadWreck(state.sessionId) : undefined; }} inspectedCase={instance} caseAccent={current.effectColor} availableCaseCount={action.availableCount}
        openLabel={action.label}
        onOpenRequest={() => {
          const { target, action: offer } = caseOpenAction(inventory.getState(), definition.id, current.instanceId);
          if (offer === 'leave' || !target) { navigation.go(parentRoute(navigation.getState()) ?? { screen: 'inventory' }); return; }
          if (target.id === current.instanceId) { void current.application.session!.openChest(); return; }
          pendingOpenInstanceId = target.status === 'available' ? target.id : undefined;
          navigation.go({ screen: 'case', caseId: definition.id, instanceId: target.id });
          runtime?.sound.unlock(); runtime?.scene.unlockAudio();
        }}
        onPrizeClose={() => { void current.application.session!.closePrize(); }}
        recentFind={current.recentFind} soundPreference={soundPreference} catalog={current.application.catalog}
        session={current.application.session} sceneElement={current.scene.element} rouletteElement={current.roulette.element}
        onOpenGesture={() => { current.sound.unlock(); current.scene.unlockAudio(); }} transitionElement={current.transitions.element}
        onRetryInitialization={current.application.initialize} backgroundUrl={resolvePublicAsset('images/minecraft-bg.png', baseUrl)} />
    </CasePresentationContext.Provider>
  </NavigationContext.Provider></StrictMode>);
  if (fresh) current.initialize();
}
let lastScreen = navigation.getState().screen;
const unsubscribeRoute = navigation.subscribe(() => {
  const screen = navigation.getState().screen;
  if (screen !== lastScreen && screen !== 'opening' && screen !== 'reward') gameAudio.navigate();
  lastScreen = screen;
  renderRoute();
});
const unsubscribeInventory = inventory.subscribe(renderRoute);
void checkSession();
if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribeRoute(); unsubscribeInventory(); navigation.dispose(); root.unmount(); previews?.dispose(); runtime?.dispose();
});
