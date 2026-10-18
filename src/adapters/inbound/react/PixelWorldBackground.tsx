import { useEffect, useRef, type CSSProperties } from 'react';
import type { ChestHandles } from '../../../application/ports/chest-handles.ts';
import type { WorldId } from '../../../config/cases.ts';
import { PixelWorld } from '../../outbound/worlds/pixel-world.ts';
import { WORLD_SCENES } from '../../outbound/worlds/index.ts';

const HOST: CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', overflow: 'hidden' };
// The same shade the still case picture had: the interface stays readable over a living world.
const SHADE: CSSProperties = { position: 'absolute', inset: 0,
  background: 'linear-gradient(180deg, rgba(5, 12, 13, 0.38), rgba(5, 12, 13, 0.18) 42%, rgba(5, 12, 13, 0.62))' };

/**
 * The living world behind the chest. It holds the chest's handles (wind, tremor, light) and may
 * pull them; the chest knows nothing about it. Without a 2D canvas the case picture stays visible.
 */
export function PixelWorldBackground({ world, chest }: { readonly world: WorldId; readonly chest?: ChestHandles }) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<PixelWorld | undefined>(undefined);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let created: PixelWorld | undefined;
    try { created = new PixelWorld(element, WORLD_SCENES[world]); } catch (error) { console.warn('The pixel world is unavailable.', error); return; }
    instance.current = created;
    return () => { created?.dispose(); instance.current = undefined; };
  }, [world]);
  useEffect(() => {
    instance.current?.hold(chest);
    return () => instance.current?.hold(undefined);
  }, [chest, world]);
  return <div ref={host} style={HOST} aria-hidden="true"><div style={SHADE} /></div>;
}
