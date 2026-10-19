import { BlockView, type StageBuilder } from '../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../application/ports/chest-handles.ts';
import { BLOCK_WORLDS, WORLD_SCENES } from '../adapters/outbound/worlds/index.ts';
import { PixelWorld } from '../adapters/outbound/worlds/pixel-world.ts';
import type { WorldId } from '../config/cases.ts';

/**
 * Development sheet of every world: each row a world, each column a moment (seconds). A world
 * already on blockworld shows in 3D; the rest still in their old 2D pixel form, marked so.
 * ?worlds=overworld&times=0,6,14. Result: window.worldSheet (JPEG data URL). Handles pulled by
 * the world are logged above each frame.
 */
const IDS = Object.keys(WORLD_SCENES) as WorldId[];
interface Shown { readonly canvas: HTMLCanvasElement; hold(host: ChestHandles): void; renderAt(seconds: number): void; dispose(): void }
const show = (id: WorldId, host: HTMLElement): Shown => {
  const builder: StageBuilder<ChestHandles> | undefined = BLOCK_WORLDS[id];
  return builder ? new BlockView(host, builder, { seed: 11 }) : new PixelWorld(host, WORLD_SCENES[id], { seed: 11 });
};
const params = new URLSearchParams(location.search);
const times = (params.get('times') ?? '0,6,24').split(',').map(Number);
const ids = (params.get('worlds') ?? IDS.join(',')).split(',').filter((id): id is WorldId => (IDS as string[]).includes(id));
const frameW = 960, frameH = 540;
const sheet = document.createElement('canvas');
sheet.width = frameW * times.length; sheet.height = (frameH + 22) * ids.length;
const g = sheet.getContext('2d')!;
g.fillStyle = '#0c1217'; g.fillRect(0, 0, sheet.width, sheet.height); g.font = '13px system-ui';
const timings: string[] = [];
for (const [row, id] of ids.entries()) {
  for (const [column, time] of times.entries()) {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-4000px;top:0;width:${frameW}px;height:${frameH}px`;
    document.body.append(host);
    const started = performance.now();
    const world = show(id, host);
    timings.push(`${id} build+mount ${(performance.now() - started).toFixed(0)}ms`);
    const pulled: string[] = [];
    world.hold({ gust: (s, side) => pulled.push(`gust ${s.toFixed(2)} ${side}`), tremor: (s, t) => pulled.push(`tremor ${s.toFixed(2)} ${t}s`), light: (c, i) => pulled.push(`light ${c} ${i.toFixed(2)}`) });
    world.renderAt(time);
    const x = column * frameW, y = row * (frameH + 22) + 22;
    g.drawImage(world.canvas, x, y, frameW, frameH);
    g.fillStyle = '#e8eef0'; g.fillText(`${id}${BLOCK_WORLDS[id] ? ' · 3D' : ' · 2D (старый)'} · ${time}s ${pulled.length ? '· ' + pulled.slice(-2).join(', ') : ''}`, x + 6, y - 7);
    world.dispose(); host.remove();
  }
}
document.body.append(sheet);
(window as unknown as { worldSheet: string; worldTimings: string[] }).worldSheet = sheet.toDataURL('image/jpeg', .85);
(window as unknown as { worldTimings: string[] }).worldTimings = timings;
document.getElementById('status')!.textContent = 'ready';
