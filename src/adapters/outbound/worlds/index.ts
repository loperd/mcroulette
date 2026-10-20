import type { WorldId } from '../../../config/cases.ts';
import type { WorldScene } from './pixel-world.ts';
import { MINER_VAULT } from './miner/index.ts';
import { DRAGON_REACH } from './dragon-reach.ts';
import { OVERWORLD } from './overworld.ts';
import { THE_END } from './the-end.ts';
import { Group } from 'three';
import type { Stage, StageBuilder } from '../../../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';
import { OVERWORLD_BLOCKS } from './overworld-blocks.ts';

/** Every pixel world, by id. */
export const WORLD_SCENES = Object.freeze({ overworld: OVERWORLD, 'deep-mine': { id: 'miner-vault-no-pixel-backdrop', paint: () => [], actors: () => [] }, end: THE_END, dragon: DRAGON_REACH } satisfies Record<WorldId, WorldScene>);
export type PixelWorldId = keyof typeof WORLD_SCENES;

/** The block worlds (packages/blockworld); a world not built yet falls back to its pixel version. */
export const BLOCK_WORLDS: Partial<Record<WorldId, StageBuilder<ChestHandles>>> = Object.freeze({ overworld: OVERWORLD_BLOCKS, 'deep-mine': MINER_VAULT });

/**
 * For a world still in 2D: a see-through 3D layer over it with nothing but a flat ground, so the
 * chest still falls onto ground, under physics, seen by a world camera. Goes once every world is 3D.
 */
export const GROUND_ONLY: StageBuilder<ChestHandles> = Object.freeze({
  id: 'ground-only',
  build: (): Stage<ChestHandles> => ({
    root: new Group(), living: [], transparent: true,
    sky: { top: '#000000', horizon: '#000000', bottom: '#000000' }, fog: { color: '#000000', near: 1e4, far: 2e4 },
    camera: { position: [0, 2.45, 9], target: [0, .75, 0], fov: 50, drift: 0, focus: [.5, .44] },
    anchor: [0, 0, 0], ground: { floor: 0 },
  }),
});
