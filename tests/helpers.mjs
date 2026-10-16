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
