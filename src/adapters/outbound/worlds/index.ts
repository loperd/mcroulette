import type { WorldId } from '../../../config/cases.ts';
import type { WorldScene } from './pixel-world.ts';
import { DEEP_MINE } from './deep-mine.ts';
import { DRAGON_REACH } from './dragon-reach.ts';
import { OVERWORLD } from './overworld.ts';
import { THE_END } from './the-end.ts';

/** Every pixel world, by id. */
export const WORLD_SCENES = Object.freeze({ overworld: OVERWORLD, 'deep-mine': DEEP_MINE, end: THE_END, dragon: DRAGON_REACH } satisfies Record<WorldId, WorldScene>);
export type PixelWorldId = keyof typeof WORLD_SCENES;
