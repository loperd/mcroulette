import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createApplication } from '../../src/composition/create-application.ts';
import { deferred, flush } from '../helpers.mjs';
import { frameEnvironment } from '../frame-environment.mjs';
import { CanvasRoulette } from '../../src/adapters/outbound/browser/canvas-roulette.ts';
import { canvasFactory } from '../canvas-harness.mjs';
import { GameTransitions } from '../../src/adapters/outbound/browser/game-transitions.ts';

const build=pathToFileURL(resolve(process.env.MCROULETTE_UI_BUILD ?? '.test-build/src')+'/');
const require=createRequire(new URL('package.json',build));
const {Window}=await import(pathToFileURL(require.resolve('happy-dom')));
const {act,createElement,StrictMode}=require('react');
const {createRoot}=require('react-dom/client');
const {App}=await import(new URL('adapters/inbound/react/App.js',build));
const items=JSON.parse(await readFile(new URL('../../public/items.json',import.meta.url),'utf8'));
const json=value=>new Response(JSON.stringify(value));

let window,root,application;
const descriptors=new Map();

beforeEach(()=>{
  window=new Window({url:'https://example.test/demo/',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  // Decorative chest canvas is checked by visibility; raster geometry has native tests.
  window.HTMLCanvasElement.prototype.getContext = () => null;
  for(const name of ['window','document','HTMLElement','Node','Event','MouseEvent','navigator']){
    descriptors.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value:name==='window'?window:window[name]});
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const container=document.createElement('div');document.body.appendChild(container);
  root=createRoot(container);
});

afterEach(async()=>{
  await act(async()=>{root.unmount();application?.dispose();});
  await window.happyDOM.abort();window.close();
  for(const [name,descriptor] of descriptors){
    if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];
  }
  descriptors.clear();delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  application=undefined;
});

async function mount(app,{sceneElement,rouletteElement,transitionElement,onOpenGesture,recentFind}={}){
  application=app;
  await act(async()=>{root.render(createElement(StrictMode,null,createElement(App,{
    catalog:app.catalog,session:app.session,preview:app.preview,sceneElement,rouletteElement,transitionElement,onOpenGesture,recentFind,
    onRetryInitialization:app.initialize,
  })));});
}

test('StrictMode hosts survive two complete game cycles through canvas roulette and real transitions', async () => {
  const env = frameEnvironment(), roulette = new CanvasRoulette(document, { ...canvasFactory(document), environment: env });
  roulette.element.getBoundingClientRect = () => ({ width: 720, height: 360 });
  const transitions = new GameTransitions(env, roulette.element);
  const sceneElement = document.createElement('div'), canvas = document.createElement('canvas');
  sceneElement.append(canvas);
  const clips = [deferred(), deferred()], landings = [deferred(), deferred()];
  let opens = 0, unlocks = 0, requests = 0, now = 0;
  const selected = JSON.parse(await readFile(new URL('../../public/selected_prize.json', import.meta.url), 'utf8'));
  const scene = { prepare: async () => {}, preview: async () => { sceneElement.hidden = false; },
    drop: () => { sceneElement.hidden = false; return landings[opens].promise; }, open: () => clips[opens++].promise,
    hide: () => { sceneElement.hidden = true; }, reset: async () => { sceneElement.hidden = false; }, dispose() {} };
  const app = createApplication({ baseUrl: 'https://example.test/demo/',
    presentation: { chest: scene, roulette, transitions },
    fetcher: async url => { if (String(url).includes('selected_prize')) { requests++; return json(selected); } return json(items); },
  });
  await mount(app, { sceneElement, rouletteElement: roulette.element, transitionElement: transitions.element, onOpenGesture() { unlocks++; } });
  await act(async () => { await app.initialize(); });
  assert.equal(sceneElement.hidden, false);
  assert.equal(document.querySelector('.game-viewport').classList.contains('game-viewport--intro'), true);
  assert.equal(document.querySelector('.chest-scene').hidden, false);
  assert.equal(document.querySelector('.roulette-scene').hidden, true);
  const advanceUntil = async phase => {
    await act(async () => {
      for (let index = 0; index < 250 && app.session.getState().phase !== phase; index++) {
        env.tick(now); now += 100; await flush();
      }
    });
    assert.equal(app.session.getState().phase, phase);
  };
  for (let cycle = 0; cycle < 2; cycle++) {
    await act(async () => { document.querySelector('.btn').click(); await flush(); });
    assert.equal(unlocks, cycle + 1); assert.equal(app.session.getState().phase, 'clearing');
    assert.equal(document.querySelector('.intro-scene').classList.contains('intro-scene--clearing'), true);
    await advanceUntil('dropping');
    assert.equal(document.querySelector('.intro-scene'), null);
    assert.equal(document.querySelector('.chest-scene').hidden, false);
    assert.equal(document.querySelector('.roulette-scene').hidden, true);
    await act(async () => { landings[cycle].resolve(); await flush(); });
    assert.equal(app.session.getState().phase, 'opening');
    // The portal behind the chest stays through clearing, the drop and the opening.
    assert.equal(roulette.element.hidden, true);
    await act(async () => { clips[cycle].resolve(); await flush(); });
    assert.equal(app.session.getState().phase, 'flashing');
    assert.equal(document.querySelector('.roulette-scene').hidden, true);
    await advanceUntil('spinning');
    assert.equal(document.querySelector('.chest-scene').hidden, true);
    assert.equal(document.querySelector('.roulette-scene').hidden, false);
    assert.equal(roulette.element.hidden, false);
    assert.equal(sceneElement.hidden, true);
    await advanceUntil('settling');
    assert.equal(document.querySelector('.prize'), null);
    await advanceUntil('prize-visible');
    assert.match(document.querySelector('.prize').textContent, /King/);
    assert.equal(roulette.element.hidden, true);
    assert.equal(document.activeElement.textContent, 'Закрыть');
    // The chest's own and the roulette's: no 2D backdrop canvas (the chest stands in a 3D world).
    assert.equal(document.querySelectorAll('canvas').length, 2);
    assert.equal(sceneElement.parentNode.className, 'game-viewport__scene');
    assert.equal(roulette.element.parentNode.className, 'game-viewport__roulette');
    await act(async () => { document.querySelector('.btn').click(); await flush(); });
    await advanceUntil('ready');
    assert.equal(document.activeElement.textContent, 'Открыть сундук');
    assert.equal(app.session.getState().slots.length, 40);
    assert.equal(sceneElement.hidden, false);
    assert.equal(env.frames.size, 0);
  }
  assert.equal(requests, 2);
  await act(async () => { app.dispose(); }); assert.equal(env.listeners.size, 0);
});

test('mounted StrictMode UI reacts from loading to the real catalog without duplicate requests',async()=>{
  const pending=deferred();let requests=0;
  const app=createApplication({baseUrl:'https://example.test/demo/',fetcher:()=>{requests++;return pending.promise;}});
  await mount(app);
  let loading;
  await act(async()=>{loading=app.initialize();await flush();});
  assert.match(document.body.textContent,/Загружаем предметы/);
  assert.equal(requests,1);
  await act(async()=>{pending.resolve(json(items));await loading;});
  assert.equal(document.querySelectorAll('.catalog__items li').length,14);
  assert.match(document.body.textContent,/King/);
  assert.equal(document.querySelectorAll('.item__inspect').length,14);
  assert.equal(document.querySelector('.actions button'),null);
  assert.equal(app.catalog.getState().phase,'ready');
});

test('clicking Retry after a real transport error replaces the error screen with the catalog',async()=>{
  let requests=0;
  const app=createApplication({baseUrl:'https://example.test/demo/',fetcher:async()=>{
    if(++requests===1)throw new Error('Connection failed');return json(items);
  }});
  await mount(app);
  await act(async()=>{await app.initialize();});
  assert.match(document.querySelector('[role="alert"]').textContent,/Не удалось загрузить/);
  assert.doesNotMatch(document.body.textContent,/Connection failed/);
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(requests,2);
  assert.equal(document.querySelector('[role="alert"]'),null);
  assert.equal(document.querySelectorAll('.catalog__items li').length,14);
});

test('unmount and composition disposal ignore a delayed response and permit a fresh application',async()=>{
  const pending=deferred();
  const old=createApplication({baseUrl:'https://example.test/demo/',fetcher:()=>pending.promise});
  await mount(old);
  let loading;
  await act(async()=>{loading=old.initialize();await flush();});
  await act(async()=>{root.unmount();old.dispose();await loading;});
  const container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
  const fresh=createApplication({baseUrl:'https://example.test/demo/',fetcher:async()=>json(items)});
  await mount(fresh);
  await act(async()=>{await fresh.initialize();pending.resolve(json(items));await flush();});
  assert.equal(old.catalog.getState().phase,'disposed');
  assert.equal(fresh.catalog.getState().phase,'ready');
  assert.equal(document.querySelectorAll('.catalog__items li').length,14);
});

test('one Retry restores both catalog and game; Open and Close invoke the actual session commands',async()=>{
  const selected=JSON.parse(await readFile(new URL('../../public/selected_prize.json',import.meta.url),'utf8'));
  let requests=0;
  const noop=async()=>{};
  const app=createApplication({baseUrl:'https://example.test/demo/',
    presentation:{
      chest:{prepare:noop,drop:noop,open:noop,hide:()=>{},reset:noop,dispose:()=>{}},
      roulette:{prepare:noop,spin:noop,reset:()=>{},dispose:()=>{}},
      transitions:{clearContent:noop,flashToRoulette:noop,finishFlash:noop,holdStoppedStrip:noop,revealPrize:noop,resetToIntro:noop,dispose:()=>{}},
    },
    fetcher:async url=>++requests===1?new Response('',{status:503}):json(url.endsWith('items.json')?items:selected),
  });
  await mount(app);
  await act(async()=>{await app.initialize();});
  assert.equal(app.catalog.getState().phase,'failed');
  assert.equal(app.session.getState().phase,'failed');
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(app.catalog.getState().phase,'ready');
  assert.equal(app.session.getState().phase,'ready');
  assert.equal(requests,2);
  assert.match(document.querySelector('.btn').textContent,/Открыть сундук/);
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(app.session.getState().phase,'prize-visible');
  assert.match(document.querySelector('#prize-title').textContent,/King/);
  assert.equal(requests,3);
  assert.equal(document.activeElement,document.querySelector('.btn'));
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(app.session.getState().phase,'ready');
  assert.match(document.querySelector('.btn').textContent,/Открыть сундук/);
  assert.equal(document.activeElement,document.querySelector('.btn'));
});

test('preview mounts its external canvas once in StrictMode and routes replay and runtime retry',async()=>{
  const element=document.createElement('div');element.appendChild(document.createElement('canvas'));
  const counts={prepare:0,drop:0,reset:0,dispose:0},listeners=new Set();
  const scene={
    prepare:async()=>{counts.prepare++;},drop:async()=>{counts.drop++;},reset:async()=>{counts.reset++;},
    subscribeErrors(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    dispose(){counts.dispose++;element.remove();},
  };
  const app=createApplication({baseUrl:'https://example.test/demo/',chestPreview:scene,fetcher:async()=>json(items)});
  await mount(app,{sceneElement:element});await act(async()=>{await app.initialize();});
  assert.equal(document.querySelectorAll('canvas').length,1);
  assert.equal(element.parentNode.className,'chest-preview__viewport');
  assert.equal(counts.prepare,1);assert.equal(counts.drop,1);
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(counts.reset,1);assert.equal(counts.drop,2);assert.equal(counts.prepare,1);
  await act(async()=>{for(const listener of listeners)listener(new Error('GPU failure'));});
  assert.match(document.querySelector('[role="alert"]').textContent,/Не удалось загрузить сундук/);
  assert.doesNotMatch(document.body.textContent,/GPU failure/);
  await act(async()=>{document.querySelector('.btn').click();await flush();});
  assert.equal(counts.prepare,2);assert.equal(counts.drop,3);
  assert.equal(document.querySelector('[role="alert"]'),null);
  assert.equal(document.querySelectorAll('canvas').length,1);
});


test('item inspection opens the selected item and restores focus after Escape', async () => {
  const app = createApplication({ baseUrl: 'https://example.test/demo/', fetcher: async () => json(items) });
  await mount(app);
  await act(async () => { await app.initialize(); });
  const trigger = document.querySelectorAll('.item__inspect')[13];
  trigger.focus();
  await act(async () => { trigger.click(); });
  const dialog = document.querySelector('dialog');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelector('h2').textContent, 'King');
  assert.match(dialog.textContent, /Легендарный/);
  assert.match(dialog.textContent, /Король за последним порталом/);
  assert.ok(dialog.querySelector('.item-details__story').textContent.length > 100);
  await act(async () => { dialog.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
  assert.equal(dialog.querySelector('h2').textContent, 'Ruler');
  assert.match(dialog.textContent, /Пепельные земли/);
  await act(async () => { dialog.querySelector('[aria-label="Следующий предмет"]').click(); });
  assert.equal(dialog.querySelector('h2').textContent, 'King');
  await act(async () => { dialog.dispatchEvent(new window.Event('cancel', { cancelable: true })); });
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, trigger);
  await act(async () => { trigger.click(); });
  await act(async () => { document.querySelector('dialog .btn').click(); });
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(document.activeElement, trigger);
});

test('sound toggle applies its preference and exposes an accessible current state', async () => {
  const { SoundControl } = await import(new URL('adapters/inbound/react/SoundControl.js', build));
  let muted = true;
  const preference = { isMuted: () => muted, setMuted(value) { muted = value; } };
  await act(async () => { root.render(createElement(StrictMode, null, createElement(SoundControl, { preference }))); });
  const button = document.querySelector('button');
  assert.equal(button.getAttribute('aria-label'), 'Включить звук');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  await act(async () => { button.click(); });
  assert.equal(muted, false);
  assert.equal(button.getAttribute('aria-label'), 'Выключить звук');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  await act(async () => { button.click(); });
  assert.equal(muted, true);
});


test('the home highlight shows the real last find and opens its story', async () => {
  const { RecentFindStore } = await import('../../src/adapters/outbound/browser/recent-find-store.ts');
  const selected = JSON.parse(await readFile(new URL('../../public/selected_prize.json', import.meta.url), 'utf8'));
  const noop = async () => {};
  const app = createApplication({ baseUrl: 'https://example.test/demo/',
    presentation: {
      chest: { prepare: noop, preview: noop, drop: noop, open: noop, hide() {}, reset: noop, dispose() {} },
      roulette: { prepare: noop, spin: noop, reset() {}, dispose() {} },
      transitions: { clearContent: noop, flashToRoulette: noop, finishFlash: noop, holdStoppedStrip: noop, revealPrize: noop, resetToIntro: noop, dispose() {} },
    },
    fetcher: async url => json(url.endsWith('items.json') ? items : selected),
  });
  const recentFind = new RecentFindStore(app.session, 'ender', () => window.localStorage);
  try {
    await mount(app, { recentFind });
    await act(async () => { await app.initialize(); });
    assert.match(document.querySelector('.case-featured').textContent, /Среди сокровищ/);
    await act(async () => { document.querySelector('.actions .btn').click(); await flush(); });
    assert.equal(app.session.getState().phase, 'prize-visible');
    await act(async () => { document.querySelector('.prize .btn').click(); await flush(); });
    const highlight = document.querySelector('.case-featured');
    assert.match(highlight.textContent, /Последняя находка/);
    assert.match(highlight.textContent, /King/);
    await act(async () => { highlight.querySelector('button').click(); });
    assert.equal(document.querySelector('dialog h2').textContent, 'King');
  } finally { recentFind.dispose(); }
});

test('router restores deep item links, keeps deployment URL and follows browser navigation', async () => {
  const { BrowserRouter, parseRoute, routePath } = await import('../../src/adapters/outbound/browser/browser-router.ts');
  const { ScreenStorage } = await import('../../src/adapters/outbound/browser/screen-storage.ts');
  const storage = new ScreenStorage(() => window.localStorage);
  const router = new BrowserRouter(window, storage);
  try {
    assert.equal(router.getState().screen, 'inventory');
    router.go({ screen: 'item', caseId: 'ender', itemId: '14' });
    assert.equal(window.location.pathname, '/demo/');
    assert.equal(window.location.hash, '#/cases/ender/items/14');
    assert.equal(parseRoute('#/cases/%ZZ').screen, 'not-found');
    assert.equal(routePath(parseRoute('#/cases/ender/items/14')), '/cases/ender/items/14');
    window.history.replaceState(null, '', '/demo/#/cases');
    window.dispatchEvent(new window.Event('popstate'));
    assert.equal(router.getState().screen, 'catalog');
    router.go({ screen: 'item', caseId: 'ender', itemId: '14' });
    router.dispose();
    window.history.replaceState(null, '', '/demo/');
    const reloaded = new BrowserRouter(window, storage);
    assert.deepEqual(reloaded.getState(), { screen: 'item', caseId: 'ender', itemId: '14' });
    reloaded.dispose();
  } finally { router.dispose(); }
});

test('item inspection is URL-driven and restored from a direct route', async () => {
  const { BrowserRouter } = await import('../../src/adapters/outbound/browser/browser-router.ts');
  const { ScreenStorage } = await import('../../src/adapters/outbound/browser/screen-storage.ts');
  const { NavigationContext } = await import(new URL('adapters/inbound/react/NavigationContext.js', build));
  const { Catalog } = await import(new URL('adapters/inbound/react/Catalog.js', build));
  const { decodeCatalog } = await import('../../src/adapters/outbound/data/item-dto.ts');
  const storage = new ScreenStorage(() => window.localStorage);
  const router = new BrowserRouter(window, storage);
  router.go({ screen: 'item', caseId: 'ender', itemId: '14' });
  try {
    await act(async () => { root.render(createElement(NavigationContext.Provider, { value: { navigation: router, storage } },
      createElement(Catalog, { items: decodeCatalog(items, new URL('https://example.test/demo/')) }))); });
    assert.equal(document.querySelector('dialog h2').textContent, 'King');
    await act(async () => { document.querySelector('[aria-label="Предыдущий предмет"]').click(); });
    assert.equal(router.getState().itemId, '13');
    assert.equal(document.querySelector('dialog h2').textContent, 'Ruler');
    await act(async () => { router.go({ screen: 'case', caseId: 'ender' }); });
    assert.equal(document.querySelector('dialog'), null);
  } finally { router.dispose(); }
});

test('inventory previews use individual metadata, selects an owned instance and remembers layout/filter state', async () => {
  const { InventoryScreen } = await import(new URL('adapters/inbound/react/InventoryScreen.js', build));
  const { DemoInventoryStore } = await import('../../src/adapters/outbound/browser/demo-inventory-store.ts');
  const { ScreenStorage } = await import('../../src/adapters/outbound/browser/screen-storage.ts');
  const { BrowserRouter } = await import('../../src/adapters/outbound/browser/browser-router.ts');
  const { CASES } = await import('../../src/config/cases.ts');
  const storage = new ScreenStorage(() => window.localStorage), inventory = new DemoInventoryStore(storage);
  const navigation = new BrowserRouter(window, storage), seen = [];
  const renderer = { async render(definition, appearance) { seen.push(appearance); return document.createElement('canvas'); } };
  const props = { inventory, cases: CASES, navigation, storage, renderer };
  try {
    await act(async () => { root.render(createElement(StrictMode, null, createElement(InventoryScreen, props))); });
    assert.equal(document.querySelectorAll('.inventory-card').length, 4);
    assert.equal(document.querySelectorAll('.inventory-card button').length, 4);
    assert.equal(document.querySelector('.inventory-card__action'), null);
    assert.equal(new Set(seen.map(value => value.seed)).size, 4);
    assert.equal(new Set(seen.map(value => value.palette.panel)).size, 3);
    assert.ok(seen.some(value => value.modifications.some(item => item.id === 'body-cracks')));
    await act(async () => { document.querySelectorAll('.inventory-card__inspect')[1].click(); });
    assert.equal(navigation.getState().instanceId, 'demo-ender-2');
    assert.equal(navigation.getState().caseId, 'ender');
    await act(async () => { document.querySelector('.inventory__density').click(); });
    assert.ok(document.querySelector('.inventory--compact'));
    const owned = inventory.getState()[0];
    await act(async () => { inventory.claim(owned.id, 's1'); inventory.complete(owned.id, 's1', { id:'p1', title:'Prize', rarity:'primary', image:'/p.png', displayWeight:1 }); });
    // The opened chest leaves the inventory for the archive; the other three stay.
    assert.equal(document.querySelectorAll('.inventory-card').length,3);
    await act(async () => { root.render(createElement(InventoryScreen, { ...props, mode:'archive', key:'archive' })); });
    assert.equal(document.querySelectorAll('.inventory-card').length,1);
    assert.match(document.querySelector('.inventory-card__reward').textContent,/Prize/);
    assert.match(document.querySelector('[aria-current="page"]').textContent,/^Архив/);
    await act(async () => { root.render(createElement(InventoryScreen, { ...props, key:'restored' })); });
    assert.ok(document.querySelector('.inventory--compact'), 'the chosen density survives a remount');
    assert.equal(document.querySelectorAll('.inventory-card').length,3);
    assert.match(document.querySelector('[aria-current="page"]').textContent,/^Инвентарь/);
  } finally { navigation.dispose(); }
});

test('owned item and reward routes retain the instance identity', async () => {
  const { parseRoute, routePath } = await import('../../src/adapters/outbound/browser/browser-router.ts');
  for (const route of [
    { screen:'case',caseId:'ender',instanceId:'mine-2' },
    { screen:'item',caseId:'ender',instanceId:'mine-2',itemId:'14' },
    { screen:'reward',caseId:'ender',instanceId:'mine-2',sessionId:'session-original' },
  ]) assert.deepEqual(parseRoute(routePath(route)),route);
  assert.deepEqual(parseRoute('/inventory'),{screen:'inventory'});
  assert.deepEqual(parseRoute(routePath({screen:'archive'})),{screen:'archive'});
});

test('case screen shows owned quantity and opens directly with one action', async () => {
  const { IntroScene } = await import(new URL('adapters/inbound/react/IntroScene.js', build));
  let opened = 0;
  const props = { items: [], phase: 'ready', actionRef: null, availableCaseCount: 3, onOpen: () => opened++ };
  await act(async () => { root.render(createElement(IntroScene, props)); });
  assert.equal(document.querySelector('.case-owned-count strong').textContent, '3');
  assert.match(document.querySelector('.case-owned-count').textContent, /можно открыть сейчас/);
  await act(async () => { document.querySelector('.case-open-bar button').click(); });
  assert.equal(opened, 1);
  await act(async () => { root.render(createElement(IntroScene, { ...props, availableCaseCount: 0, openLabel: 'К инвентарю' })); });
  assert.equal(document.querySelector('.case-owned-count strong').textContent, '0');
  assert.equal(document.querySelector('.case-open-bar button').textContent, 'К инвентарю');
  assert.match(document.querySelector('.case-owned-count').textContent, /нет доступных для открытия/);
});

test('bulk demo inventory renders stacks with quantity, wear and palette; an opening leaves its stack', async () => {
  const { InventoryScreen } = await import(new URL('adapters/inbound/react/InventoryScreen.js', build));
  const { DemoInventoryStore } = await import('../../src/adapters/outbound/browser/demo-inventory-store.ts');
  const { ScreenStorage } = await import('../../src/adapters/outbound/browser/screen-storage.ts');
  const { BrowserRouter } = await import('../../src/adapters/outbound/browser/browser-router.ts');
  const { CASES } = await import('../../src/config/cases.ts');
  const storage = new ScreenStorage(() => window.localStorage), inventory = new DemoInventoryStore(storage);
  inventory.seedDemoStock(CASES);
  const navigation = new BrowserRouter(window, storage);
  const renderer = { async render() { return document.createElement('canvas'); } };
  try {
    const { groupInventory } = await import('../../src/application/inventory-groups.ts');
    const quantities = () => [...document.querySelectorAll('.inventory-card__quantity')].map(node => Number.parseInt(node.textContent, 10));
    const sum = values => values.reduce((total, value) => total + value, 0);
    await act(async () => { root.render(createElement(InventoryScreen, { inventory, cases: CASES, navigation, storage, renderer })); });
    // Varied stock: one card per visual variant, and the stacks add up to every owned chest.
    const available = inventory.getState().filter(item => item.status === 'available');
    assert.equal(document.querySelectorAll('.inventory-card').length, groupInventory(available).length);
    assert.equal(sum(quantities()), available.length);
    assert.ok(available.length >= CASES.length * 100, 'every case type is stocked');
    await act(async () => { document.querySelector('.inventory-card__inspect').click(); });
    assert.ok(inventory.getState().some(item => item.id === navigation.getState().instanceId), 'inspecting opens one owned instance');
    await act(async () => { inventory.claim(available[0].id, 'stack-test'); });
    assert.equal(sum([...document.querySelectorAll('.inventory-card--available .inventory-card__quantity')].map(node => Number.parseInt(node.textContent, 10))), available.length - 1);
    assert.equal(document.querySelector('.inventory-card--opening .inventory-card__quantity').textContent, '1 шт.', 'an opening leaves its stack');
  } finally { navigation.dispose(); }
});

test('case details show exact selected-instance wear and status', async () => {
  const { IntroScene } = await import(new URL('adapters/inbound/react/IntroScene.js', build));
  const { createChestAppearance, changeChestAppearance } = await import('../../src/domain/chest-appearance.ts');
  const inspectedCase = { id:'owned', caseId:'ender', status:'available', appearance: changeChestAppearance(createChestAppearance(), { modifications: [{ id:'body-cracks', intensity:.35 }, { id:'lid-cracks', intensity:.15 }, { id:'moss', intensity:.5 }] }) };
  await act(async () => { root.render(createElement(IntroScene, { items:[], phase:'ready', actionRef:null, onOpen() {}, availableCaseCount:100, inspectedCase })); });
  // The case screen shows integrity per part and the state; the feature list lives in the inventory.
  assert.match(document.querySelector('.chest-indicators').textContent, /Корпус65%Крышка85%Замок100%/);
  assert.equal(document.querySelector('.chest-indicators__details'), null);
  assert.equal(document.querySelector('.case-owned-count strong').textContent, '100');
});

test('type directory shows owned available count, excluding consumed cases', async () => {
  const { CaseDirectory } = await import(new URL('adapters/inbound/react/CaseDirectory.js', build));
  const { DemoInventoryStore } = await import('../../src/adapters/outbound/browser/demo-inventory-store.ts');
  const { ScreenStorage } = await import('../../src/adapters/outbound/browser/screen-storage.ts');
  const { CASES } = await import('../../src/config/cases.ts');
  const storage = new ScreenStorage(() => window.localStorage), inventory = new DemoInventoryStore(storage);
  inventory.seedDemoStock(CASES);
  const first = inventory.getState().find(instance => instance.caseId === CASES[0].id && instance.status === 'available');
  const before = inventory.getState().filter(instance => instance.caseId === CASES[0].id && instance.status === 'available').length;
  inventory.claim(first.id, 'already-opening');
  await act(async () => { root.render(createElement(CaseDirectory, { cases:CASES, instances:inventory.getState(), storage, navigation:{ go() {} }, renderer:{ async render() { return document.createElement('canvas'); } } })); });
  assert.equal(document.querySelector('.case-card__owned strong').textContent, `${before - 1} шт.`, 'a chest being opened is not counted as ready');
});

test('reward screen keeps remaining stock visible', async () => {
  const { PrizeScene } = await import(new URL('adapters/inbound/react/PrizeScene.js', build));
  await act(async () => { root.render(createElement(PrizeScene, { prize:{ id:'p', title:'Prize', rarity:'primary', image:'/p.png' }, actionRef:null, onClose() {}, availableCaseCount:99, returnLabel:'Вернуться в инвентарь' })); });
  assert.equal(document.querySelector('.prize__remaining').textContent, 'Готово к открытию: 99 шт.');
  assert.match(document.querySelector('.prize__actions').textContent, /Вернуться в инвентарь/);
});
