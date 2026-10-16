import type { ErrorReporter } from '../../../application/ports/error-reporter.ts';
import type { SessionState } from '../../../application/session-state.ts';

/**
 * The player must never be left hanging. Anything unexpected — an uncaught error, a rejected
 * promise nobody handles, a session phase that never ends, a runtime rebuilding in a loop — is
 * reported and answered with one modal: what happened, "На главную" and "Перезагрузить".
 *
 * The modal is plain DOM outside React, so it still works when the React tree is the thing that
 * broke. Time limits count only while the tab is visible (animation frames pause in background
 * tabs; that is not a hang).
 */
type Phase = SessionState['phase'];
export interface WatchedSession { getState(): SessionState; subscribe(listener: () => void): () => void }

/** Longest a phase may last (visible seconds) before it counts as a hang. Others are open-ended. */
export const PHASE_LIMITS: Partial<Record<Phase, number>> = {
  loading: 30, clearing: 15, dropping: 25, opening: 25, flashing: 15,
  spinning: 45, settling: 15, revealing: 15, resetting: 20,
};
/** More rebuilds of the same case runtime than this within the window is a render loop. */
const REBUILD_LIMIT = 6, REBUILD_WINDOW = 3000;

export interface FailsafeOptions {
  readonly document: Document;
  readonly reporter: ErrorReporter;
  /** Leave whatever is broken: navigate to the main screen. */
  readonly goHome: () => void;
  readonly reload?: () => void;
  readonly now?: () => number;
  readonly limits?: Partial<Record<Phase, number>>;
}

export class Failsafe {
  private readonly options: FailsafeOptions;
  private readonly limits: Partial<Record<Phase, number>>;
  private readonly now: () => number;
  private dialog?: HTMLDialogElement;
  private open = false;
  private readonly rebuilds = new Map<string, number[]>();
  private readonly cleanups: (() => void)[] = [];

  constructor(options: FailsafeOptions) {
    this.options = options;
    this.limits = { ...PHASE_LIMITS, ...options.limits };
    this.now = options.now ?? (() => Date.now());
  }

  /** Global safety net: uncaught errors and unhandled rejections. */
  install(): () => void {
    const view = this.options.document.defaultView;
    if (!view) return () => {};
    const onError = (event: ErrorEvent) => this.fatal('UNCAUGHT_ERROR', event.error ?? event.message, { source: event.filename, line: event.lineno });
    const onRejection = (event: PromiseRejectionEvent) => this.fatal('UNHANDLED_REJECTION', event.reason);
    view.addEventListener('error', onError);
    view.addEventListener('unhandledrejection', onRejection);
    const remove = () => { view.removeEventListener('error', onError); view.removeEventListener('unhandledrejection', onRejection); };
    this.cleanups.push(remove);
    return remove;
  }

  /**
   * Watches one session: reports every failure it reaches, and treats a phase that outlives its
   * limit as a hang. `tick` advances the watchdog (one second by default, driven by setInterval).
   */
  watch(session: WatchedSession, context: Readonly<Record<string, unknown>>, interval = 1000): () => void {
    let phase = session.getState().phase, visibleFor = 0, last = this.now(), fired = false;
    const document = this.options.document;
    const onChange = () => {
      const state = session.getState();
      if (state.phase === phase) return;
      this.options.reporter.breadcrumb(`session ${phase} → ${state.phase}`, context);
      phase = state.phase; visibleFor = 0; last = this.now(); fired = false;
      if (state.phase === 'failed') {
        // Expected, recoverable failures have their own screen; they are still tracked.
        this.options.reporter.capture(new Error(state.failure.message), { ...context, code: state.failure.code, phase: state.failure.phase, recovery: state.failure.recovery });
      }
    };
    const unsubscribe = session.subscribe(onChange);
    const tick = () => {
      const time = this.now();
      if (document.visibilityState !== 'hidden') visibleFor += (time - last) / 1000;
      last = time;
      const limit = this.limits[phase];
      if (!fired && limit !== undefined && visibleFor > limit) {
        fired = true;
        this.fatal('STUCK_PHASE', new Error(`The ${phase} phase did not finish in ${limit}s.`), { ...context, phase, seconds: Math.round(visibleFor) });
      }
    };
    const timer = setInterval(tick, interval);
    const stop = () => { clearInterval(timer); unsubscribe(); };
    this.cleanups.push(stop);
    return stop;
  }

  /** Call whenever a case runtime is (re)built; too many in a short time is a loop. */
  noteRebuild(identity: string): void {
    const time = this.now(), recent = (this.rebuilds.get(identity) ?? []).filter(at => time - at < REBUILD_WINDOW);
    recent.push(time);
    this.rebuilds.set(identity, recent);
    if (recent.length > REBUILD_LIMIT) {
      this.rebuilds.delete(identity);
      this.fatal('RENDER_LOOP', new Error(`The case runtime was rebuilt ${recent.length} times in ${REBUILD_WINDOW / 1000}s.`), { identity });
    }
  }

  /** Report and show the modal (once until it is dismissed). */
  fatal(code: string, error: unknown, context: Readonly<Record<string, unknown>> = {}): void {
    this.options.reporter.capture(error ?? new Error(code), { ...context, code });
    if (this.open) return;
    this.open = true;
    this.show(code);
  }

  get visible(): boolean { return this.open; }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.dialog?.remove(); this.dialog = undefined; this.open = false;
  }

  private show(code: string) {
    const document = this.options.document;
    if (!this.dialog) {
      ensureStyles(document);
      const dialog = document.createElement('dialog');
      dialog.className = 'failsafe';
      dialog.setAttribute('role', 'alertdialog');
      dialog.setAttribute('aria-labelledby', 'failsafe-title');
      dialog.setAttribute('aria-describedby', 'failsafe-text');
      dialog.innerHTML = `<div class="failsafe__panel">
        <p class="failsafe__eyebrow">Что-то пошло не так</p>
        <h2 id="failsafe-title">Сундук завис</h2>
        <p id="failsafe-text">Мы уже знаем об ошибке. Ваши сундуки и награды на месте — можно вернуться на главную или перезагрузить страницу.</p>
        <p class="failsafe__code"></p>
        <div class="failsafe__actions"><button type="button" class="btn btn-green" data-action="home">На главную</button>
          <button type="button" class="btn btn-transparent" data-action="reload">Перезагрузить</button></div>
      </div>`;
      dialog.addEventListener('click', event => {
        const action = (event.target as Element | null)?.closest?.('[data-action]')?.getAttribute('data-action');
        if (action === 'home') this.goHome();
        else if (action === 'reload') (this.options.reload ?? (() => document.defaultView?.location.reload()))();
      });
      // Escape means the same as "На главную": never back into the broken state.
      dialog.addEventListener('cancel', event => { event.preventDefault(); this.goHome(); });
      document.body.append(dialog);
      this.dialog = dialog;
    }
    this.dialog.querySelector('.failsafe__code')!.textContent = `Код: ${code}`;
    try { this.dialog.showModal(); } catch { this.dialog.setAttribute('open', ''); }
    (this.dialog.querySelector('[data-action="home"]') as HTMLButtonElement | null)?.focus();
  }

  private goHome() {
    this.dialog?.close?.(); this.dialog?.removeAttribute('open');
    this.open = false;
    try { this.options.goHome(); } catch (error) { this.options.reporter.capture(error, { code: 'GO_HOME_FAILED' }); this.options.document.defaultView?.location.assign('#/inventory'); }
  }
}

function ensureStyles(document: Document) {
  if (document.getElementById('failsafe-styles')) return;
  const style = document.createElement('style');
  style.id = 'failsafe-styles';
  style.textContent = `
    .failsafe { padding: 0; border: 0; background: transparent; max-width: min(460px, calc(100vw - 32px)); }
    .failsafe::backdrop { background: #07050acc; backdrop-filter: blur(4px); }
    .failsafe__panel { display: grid; gap: 12px; padding: 30px 26px; border: 1px solid #6b3a33; border-radius: 12px;
      background: radial-gradient(ellipse at 50% 0%, #3a1d1a, #140d0c 75%); color: #e9dcd9; text-align: center; font: 15px/1.45 system-ui, sans-serif; }
    .failsafe__eyebrow { margin: 0; color: #e3665a; font-size: 10px; letter-spacing: .16em; text-transform: uppercase; }
    .failsafe h2 { margin: 0; color: #f4e9e6; font-size: 26px; }
    .failsafe p { margin: 0; }
    .failsafe__code { color: #8c716b; font-size: 11px; }
    .failsafe__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 8px; }`;
  document.head.append(style);
}
