import { useEffect, useRef, type CSSProperties } from 'react';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';
import type { WorldId } from '../../../config/cases.ts';
import { PixelWorld } from '../../outbound/worlds/pixel-world.ts';
import { BlockView, type Guest } from '../../../../packages/blockworld/src/index.ts';
import { BLOCK_WORLDS, GROUND_ONLY, WORLD_SCENES } from '../../outbound/worlds/index.ts';

const HOST: CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' };
// The same shade the still case picture had, so the interface reads over a living world; laid by
// the world over itself and under the chest, so the chest is never dimmed.
const VEIL = { color: '#050c0d', top: .38, middle: .18, bottom: .62 };

/**
 * The world, the base everything happens in. The chest is its guest: the world stands it on its
 * ground, drops it under its physics and draws it with its camera; it may pull the chest's handles
 * (wind, tremor, light). A world still in 2D gets a see-through 3D ground over it for the chest.
 * Without WebGL the case picture stays visible.
 */
export function PixelWorldBackground({ world, chest, guest }: { readonly world: WorldId; readonly chest?: ChestHandles; readonly guest?: Guest }) {
  const host = useRef<HTMLDivElement>(null);
  const views = useRef<{ backdrop?: PixelWorld; stage?: BlockView<ChestHandles> }>({});
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const made: { backdrop?: PixelWorld; stage?: BlockView<ChestHandles> } = {};
    try {
      const blocks = BLOCK_WORLDS[world];
      if (!blocks) made.backdrop = new PixelWorld(element, WORLD_SCENES[world]);
      made.stage = new BlockView(element, blocks ?? GROUND_ONLY, { veil: VEIL });
      // In front of a 2D backdrop.
      if (made.backdrop) element.append(made.stage.canvas);
    } catch (error) { console.warn('The world is unavailable; the case picture stays.', error); }
    views.current = made;
    return () => { made.stage?.dispose(); made.backdrop?.dispose(); views.current = {}; };
  }, [world]);
  useEffect(() => {
    const { backdrop, stage } = views.current;
    backdrop?.hold(chest); stage?.hold(chest);
    return () => { backdrop?.hold(undefined); stage?.hold(undefined); };
  }, [chest, world]);
  useEffect(() => {
    const { stage } = views.current;
    if (!guest || !stage) return;
    stage.admit(guest);
    return () => stage.dismiss(guest);
  }, [guest, world]);
  return <div ref={host} style={HOST} aria-hidden="true" />;
}
