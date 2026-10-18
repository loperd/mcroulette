import { PixelWorld } from '../adapters/outbound/worlds/pixel-world.ts';
import { WORLD_SCENES } from '../adapters/outbound/worlds/index.ts';

/**
 * Development sheet for the pixel worlds: each row a world, each column a moment (seconds).
 * ?worlds=overworld,end picks rows; ?times=0,4,12. Result: window.worldSheet (PNG data URL).
 * Handles pulled by the world are logged under each frame.
 */
const params = new URLSearchParams(location.search);
const times = (params.get('times') ?? '0,6,14').split(',').map(Number);
const ids = (params.get('worlds') ?? Object.keys(WORLD_SCENES).join(',')).split(',').filter(id => id in WORLD_SCENES);
const scale = 2, frameW = 480 * scale, frameH = 270 * scale;
const sheet = document.createElement('canvas');
sheet.width = frameW * times.length; sheet.height = (frameH + 22) * ids.length;
const g = sheet.getContext('2d')!; g.imageSmoothingEnabled = false;
g.fillStyle = '#0c1217'; g.fillRect(0, 0, sheet.width, sheet.height); g.font = '13px system-ui';
for (const [row, id] of ids.entries()) {
  for (const [column, time] of times.entries()) {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-4000px;top:0;width:480px;height:270px';
    document.body.append(host);
    const world = new PixelWorld(host, WORLD_SCENES[id as keyof typeof WORLD_SCENES], { seed: 11 });
    const pulled: string[] = [];
    world.hold({ gust: (s, side) => pulled.push(`gust ${s.toFixed(2)} ${side}`), tremor: (s, t) => pulled.push(`tremor ${s.toFixed(2)} ${t}s`), light: (c, i) => pulled.push(`light ${c} ${i.toFixed(2)}`) });
    world.renderAt(time);
    const x = column * frameW, y = row * (frameH + 22) + 22;
    g.drawImage(world.canvas, x, y, frameW, frameW * world.canvas.height / world.canvas.width);
    g.fillStyle = '#e8eef0'; g.fillText(`${id} · ${time}s ${pulled.length ? '· ' + pulled.slice(-2).join(', ') : ''}`, x + 6, y - 7);
    world.dispose(); host.remove();
  }
}
document.body.append(sheet);
(window as unknown as { worldSheet: string }).worldSheet = sheet.toDataURL('image/png');
document.getElementById('status')!.textContent = 'ready';
