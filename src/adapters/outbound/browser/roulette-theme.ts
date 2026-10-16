export type RouletteTheme = 'ender' | 'gallery' | 'minimal';
export const rouletteThemes = {
  ender: { card: '#12272b', focus: '#0c2023', cursor: '#91f0d4', stripe: 3, outside: 0.45 },
  gallery: { card: '#28251f', focus: '#221e18', cursor: '#ead09a', stripe: 2, outside: 0.5 },
  minimal: { card: '#1b242a', focus: '#151d22', cursor: '#e0e8ed', stripe: 2, outside: 0.32 },
} as const;
