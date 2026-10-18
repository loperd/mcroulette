/**
 * What a world may do to the chest living in it — and nothing more. The chest lives on its own
 * (it stands, falls and opens by itself); a world only pulls these handles. The chest never learns
 * which world it is in and never affects it back.
 */
export interface ChestHandles {
  /** Wind from one side: hanging parts swing. strength 0..1; side -1 from the left, 1 from the right. */
  gust(strength: number, side: number): void;
  /** The ground shakes under the chest for `seconds`. strength 0..1. */
  tremor(strength: number, seconds: number): void;
  /** Light from the world falls on the chest (a lava flare, an ender flash). intensity 0..1. */
  light(color: string, intensity: number, seconds: number): void;
}

/** A chest that is not there (yet): the world keeps living, the handles do nothing. */
export const NO_CHEST: ChestHandles = Object.freeze({ gust() {}, tremor() {}, light() {} });
