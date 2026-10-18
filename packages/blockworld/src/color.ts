import { Color, LinearSRGBColorSpace } from 'three';

/**
 * Colours exactly as written: the view outputs without colour management or tone mapping, the way
 * the game shows them — a computed brightness is the brightness on screen.
 */
export function raw(hex: string): Color {
  return new Color().setHex(parseInt(hex.replace('#', '').slice(0, 6), 16), LinearSRGBColorSpace);
}
