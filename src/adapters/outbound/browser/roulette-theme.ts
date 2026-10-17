export type RouletteTheme = 'ender' | 'gallery' | 'minimal';
export const rouletteThemes = {
  ender: { card: '#12272b', focus: 'rgba(0, 0, 0, 0.17)', cursor: '#91f0d4', stripe: 3, outside: 0.45 },
  gallery: { card: '#28251f', focus: 'rgba(0, 0, 0, 0.17)', cursor: '#ead09a', stripe: 2, outside: 0.5 },
  minimal: { card: '#1b242a', focus: 'rgba(0, 0, 0, 0.17)', cursor: '#e0e8ed', stripe: 2, outside: 0.32 },
} as const;
