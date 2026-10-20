export type RouletteTheme = 'ender' | 'gallery' | 'minimal';
export const rouletteThemes = {
  ender: { card: '#12272b', cursor: '#91f0d4', stripe: 3 },
  gallery: { card: '#28251f', cursor: '#ead09a', stripe: 2 },
  minimal: { card: '#1b242a', cursor: '#e0e8ed', stripe: 2 },
} as const;
