import { mix, type Painter, type Rand } from './pixel.ts';

/**
 * The end-stone island the chest stands on in the End worlds: a flat top in 8-pixel blocks, cliffs
 * at both sides dropping into the void, the stone darkening away from the light with violet seeping
 * up from below — so it reads as an island floating in nothing, not as a desert.
 */
export function islandGround(g: Painter, W: number, H: number, top: number, pad: number, rand: Rand): void {
  const cliff = (x: number) => {
    // Distance into the island from its side edge, ragged.
    const fromEdge = Math.min(x + pad, W + pad - x);
    return fromEdge < W * .07 ? (W * .07 - fromEdge) * 2.2 + Math.sin(x * 1.7) * 2 : 0;
  };
  for (let x = -pad; x < W + pad; x++) {
    const surface = top + Math.round(Math.sin(x * .09) * 1.5 + Math.sin(x * .031) * 2 + cliff(x));
    if (surface >= H) continue;
    for (let y = surface; y < H; y++) {
      const down = (y - surface) / (H - top);
      let color = y - surface < 2 ? '#e2deaa' : mix('#cdc98e', '#3b2453', Math.min(1, down * 1.25));
      if ((x + pad) % 8 === 0 || (y - surface) % 8 === 7) color = mix(color, '#000000', .08);
      if (rand() < .06) color = mix(color, rand() < .5 ? '#000000' : '#ffffff', .12);
      g.px(x, y, color);
    }
  }
}
