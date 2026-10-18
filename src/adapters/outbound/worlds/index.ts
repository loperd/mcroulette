import type { WorldId } from '../../../config/cases.ts';
import type { WorldScene } from './pixel-world.ts';
import { DEEP_MINE } from './deep-mine.ts';
import { DRAGON_REACH } from './dragon-reach.ts';
import { OVERWORLD } from './overworld.ts';
import { THE_END } from './the-end.ts';
import type { StageBuilder } from '../../../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';
import { OVERWORLD_BLOCKS } from './overworld-blocks.ts';

/** Every pixel world, by id. */
export const WORLD_SCENES = Object.freeze({ overworld: OVERWORLD, 'deep-mine': DEEP_MINE, end: THE_END, dragon: DRAGON_REACH } satisfies Record<WorldId, WorldScene>);
export type PixelWorldId = keyof typeof WORLD_SCENES;

/** The block worlds (packages/blockworld); a world not built yet falls back to its pixel version. */
export const BLOCK_WORLDS: Partial<Record<WorldId, StageBuilder<ChestHandles>>> = Object.freeze({ overworld: OVERWORLD_BLOCKS });
