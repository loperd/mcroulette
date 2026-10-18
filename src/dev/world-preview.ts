import { BlockView, type StageBuilder } from '../../packages/blockworld/src/index.ts';
import type { ChestHandles } from '../application/ports/chest-handles.ts';
import { OVERWORLD_BLOCKS } from '../adapters/outbound/worlds/overworld-blocks.ts';

/**
 * Development sheet for the 3D worlds: each row a world, each column a moment (seconds).
 * ?worlds=overworld&times=0,6,14. Result: window.worldSheet (JPEG data URL). Handles pulled by
 * the world are logged above each frame.
 */
const SCENES: Record<string, StageBuilder<ChestHandles>> = { overworld: OVERWORLD_BLOCKS };
const params = new URLSearchParams(location.search);
const times = (params.get('times') ?? '0,6,24').split(',').map(Number);
const ids = (params.get('worlds') ?? Object.keys(SCENES).join(',')).split(',').filter(id => id in SCENES);
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
    const world = new BlockView(host, SCENES[id]!, { seed: 11 });
    timings.push(`${id} build+mount ${(performance.now() - started).toFixed(0)}ms`);
    const pulled: string[] = [];
    world.hold({ gust: (s, side) => pulled.push(`gust ${s.toFixed(2)} ${side}`), tremor: (s, t) => pulled.push(`tremor ${s.toFixed(2)} ${t}s`), light: (c, i) => pulled.push(`light ${c} ${i.toFixed(2)}`) });
    world.renderAt(time);
    const x = column * frameW, y = row * (frameH + 22) + 22;
    g.drawImage(world.canvas, x, y, frameW, frameH);
    g.fillStyle = '#e8eef0'; g.fillText(`${id} · ${time}s ${pulled.length ? '· ' + pulled.slice(-2).join(', ') : ''}`, x + 6, y - 7);
    world.dispose(); host.remove();
  }
}
document.body.append(sheet);
(window as unknown as { worldSheet: string; worldTimings: string[] }).worldSheet = sheet.toDataURL('image/jpeg', .85);
(window as unknown as { worldTimings: string[] }).worldTimings = timings;
document.getElementById('status')!.textContent = 'ready';
