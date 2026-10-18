import type { WorldId } from '../../../config/cases.ts';
import type { WorldScene } from './pixel-world.ts';
import { DEEP_MINE } from './deep-mine.ts';
import { DRAGON_REACH } from './dragon-reach.ts';
import { OVERWORLD } from './overworld.ts';
import { THE_END } from './the-end.ts';
import { OVERWORLD_3D } from './overworld-3d.ts';
import type { VoxelWorldScene } from './voxel-world.ts';

/** Every pixel world, by id. */
export const WORLD_SCENES = Object.freeze({ overworld: OVERWORLD, 'deep-mine': DEEP_MINE, end: THE_END, dragon: DRAGON_REACH } satisfies Record<WorldId, WorldScene>);
export type PixelWorldId = keyof typeof WORLD_SCENES;

/** The 3D block worlds; a world not built in 3D yet falls back to its pixel version. */
export const VOXEL_WORLDS: Partial<Record<WorldId, VoxelWorldScene>> = Object.freeze({ overworld: OVERWORLD_3D });
