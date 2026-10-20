import { HemisphereLight } from 'three';
import type { StageBuilder } from '../../../../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../../../../application/ports/chest-handles.ts';
import { MineParts } from './parts.ts';
import { cavern, fortress, galleries } from './architecture.ts';
import { miningProps } from './props.ts';
import { atmosphere } from './atmosphere.ts';

/** An independent, entirely geometric stage for the miner chest. No backdrop image. */
export const MINER_VAULT: StageBuilder<ChestHandles> = {
  id: 'miner-vault-fortress-v1',
  build(seed) {
    let state = seed >>> 0;
    const p = new MineParts(() => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; });
    cavern(p); fortress(p); galleries(p); miningProps(p);
    const living = atmosphere(p);
    p.flush();
    p.root.add(new HemisphereLight('#6c87b4', '#724025', 1.7));
    return {
      root: p.root, living, calm: .02,
      sky: { top: '#0a1221', horizon: '#182132', bottom: '#100c10' },
      fog: { color: '#202332', near: 27, far: 100 },
      camera: { position: [0, 8.5, 25], target: [0, 5.2, -15], fov: 54, drift: .025, focus: [.5, .44] },
      anchor: [0, -.5, 0], ground: { floor: -.5 }, flicker: .1,
    };
  },
};
