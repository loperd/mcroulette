export function item(id, displayWeight = 0, overrides = {}) {
  return { id: String(id), title: `Item ${id}`, image: `/items/${id}.png`,
    rarity: 'default', displayWeight, ...overrides };
}

// The legacy catalog's exact percentages. Round(40 * weight / 100) totals 39.
export function legacyCatalog() {
  const names = ['Vip', 'Premium', 'Creative', 'Admin', 'Lord', 'Enigma', 'Deluxe',
    'Caesar', 'Baron', 'Hero', 'Sentinel', 'Emperor', 'Ruler', 'King'];
  return [25, 15, 10, 7, 7, 6, 5, 5, 5, 5, 3, 3, 3, 1].map((weight, index) =>
    item(index + 1, weight, {title: names[index],
      rarity: index < 7 ? 'default' : index < 12 ? 'primary' : 'legendary'}));
}

export const constantRandom = (value = 0.5) => ({ next: () => value });

export function seededRandom(seed) {
  let state = seed >>> 0;
  return { next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  }};
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

export const flush = () => new Promise(resolve => setImmediate(resolve));

/**
 * A stand-in for the server's inventory API (GET /api/v1/inventory, POST …/claim|complete|destroy,
 * PUT …/appearance) holding chest DTOs as the server sends them; `rewards` maps a session to the
 * item DTO the server rolled for it.
 */
export function inventoryServer(chests, rewards = {}) {
  const rows = new Map(chests.map(chest => [chest.id, { status: 'available', seed: 1, ...chest }]));
  const json = value => ({ ok: true, status: 200, json: async () => structuredClone(value) });
  const fetcher = async (url, init = {}) => {
    const path = new URL(url).pathname.replace(/^.*\/api\/v1\/inventory/, '');
    if (!init.method || init.method === 'GET') return json([...rows.values()]);
    const [, id, action] = path.split('/'), row = rows.get(decodeURIComponent(id)), body = JSON.parse(init.body);
    if (!row) return { ok: false, status: 404, json: async () => ({}) };
    if (action === 'claim') Object.assign(row, { status: 'opening', sessionId: body.sessionId });
    if (action === 'complete') Object.assign(row, { status: 'opened', reward: rewards[body.sessionId] ?? { id: 'p1', title: 'Prize', image: '/p.png', type: 'primary', chance: 1 }, openedAt: new Date(0).toISOString() });
    if (action === 'destroy') Object.assign(row, { status: 'destroyed' });
    if (action === 'appearance') row.appearance = body.appearance;
    return json(row);
  };
  return { fetcher, rows };
}

/** A server inventory for the given chest DTOs, read once, ready to use. */
export async function loadedInventory(chests, rewards) {
  const { ApiInventory } = await import('../src/adapters/outbound/data/api-inventory.ts');
  const { CASES } = await import('../src/config/cases.ts');
  const server = inventoryServer(chests, rewards), errors = [];
  const inventory = new ApiInventory('https://example.test/', CASES, error => errors.push(error), server.fetcher);
  await inventory.load();
  return { inventory, server, errors };
}

/** Every case type stocked as the server would issue it: `count` chests each, varied seeds. */
export function issuedStock(cases, count = 100) {
  return cases.flatMap(definition => Array.from({ length: count }, (_, index) => ({ id: `${definition.id}-${index}`, caseId: definition.id, seed: (index * 2654435761) >>> 0 })));
}
