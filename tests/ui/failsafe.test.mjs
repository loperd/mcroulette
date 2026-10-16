import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { Failsafe } from '../../src/adapters/inbound/browser/failsafe.ts';

function setup(overrides = {}) {
  const window = new Window(), document = window.document;
  const reports = [], crumbs = [];
  let time = 0, home = 0;
  const failsafe = new Failsafe({ document, reporter: { capture: (error, context) => reports.push({ error, context }), breadcrumb: message => crumbs.push(message) },
    goHome: () => home++, reload: () => {}, now: () => time, ...overrides });
  return { window, document, failsafe, reports, crumbs, advance: seconds => { time += seconds * 1000; }, homes: () => home };
}
function session(phase) {
  const listeners = new Set(); let state = { phase };
  return { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(next) { state = next; for (const listener of listeners) listener(); } };
}

test('a phase that never ends opens the modal once and reports it; leaving goes home', async () => {
  const { document, failsafe, reports, advance, homes } = setup({ limits: { opening: 2 } });
  const watched = session('opening');
  failsafe.watch(watched, { caseId: 'ender' }, 5);
  advance(1); await new Promise(r => setTimeout(r, 12));
  assert.equal(failsafe.visible, false);
  advance(2); await new Promise(r => setTimeout(r, 12));
  assert.equal(failsafe.visible, true);
  assert.equal(reports.at(-1).context.code, 'STUCK_PHASE'); assert.equal(reports.at(-1).context.phase, 'opening');
  const before = reports.length; advance(5); await new Promise(r => setTimeout(r, 12));
  assert.equal(reports.length, before, 'one report per stuck phase');
  document.querySelector('[data-action="home"]').click();
  assert.equal(homes(), 1); assert.equal(failsafe.visible, false);
  failsafe.dispose();
});

test('phases that move on are fine; failures are tracked without the modal', async () => {
  const { failsafe, reports, crumbs, advance } = setup({ limits: { opening: 2 } });
  const watched = session('opening');
  failsafe.watch(watched, {}, 5);
  advance(1.5); watched.set({ phase: 'spinning' }); advance(1.5); await new Promise(r => setTimeout(r, 12));
  assert.equal(failsafe.visible, false);
  watched.set({ phase: 'failed', failure: { code: 'X', message: 'boom', phase: 'spinning', recovery: 'reset' } });
  assert.equal(failsafe.visible, false);
  assert.equal(reports.at(-1).context.code, 'X');
  assert.ok(crumbs.includes('session opening → spinning'));
  failsafe.dispose();
});

test('a runtime rebuilt in a loop and unhandled errors both end in the modal', async () => {
  const { window, failsafe, reports } = setup();
  for (let i = 0; i < 7; i++) failsafe.noteRebuild('ender:a');
  assert.equal(failsafe.visible, true); assert.equal(reports.at(-1).context.code, 'RENDER_LOOP');
  failsafe.dispose();
  const second = setup(); second.failsafe.install();
  second.window.dispatchEvent(new second.window.ErrorEvent('error', { error: new Error('kaput'), message: 'kaput' }));
  assert.equal(second.failsafe.visible, true); assert.equal(second.reports.at(-1).context.code, 'UNCAUGHT_ERROR');
  second.failsafe.dispose(); window.close(); second.window.close();
});
