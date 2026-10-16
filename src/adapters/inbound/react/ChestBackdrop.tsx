import { useCallback } from 'react';
import { drawLegacyCircle } from '../../outbound/browser/legacy-circle.ts';

/** Static decoration for the falling chest; never part of the roulette lens. */
export function ChestBackdrop({ visible }: { readonly visible: boolean }) {
  const mount = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !visible) return;
    const view = canvas.ownerDocument.defaultView;
    const context = canvas.getContext('2d');
    if (!view || !context) return;
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      const ratio = Math.min(view.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawLegacyCircle(context, width, height);
    };
    const Observer = (view as Window & typeof globalThis).ResizeObserver;
    const observer = Observer ? new Observer(draw) : undefined;
    observer?.observe(canvas); view.addEventListener('resize', draw); draw();
    return () => {
      observer?.disconnect(); view.removeEventListener('resize', draw);
      canvas.width = 0; canvas.height = 0;
    };
  }, [visible]);
  return <canvas className="chest-backdrop" hidden={!visible} aria-hidden="true" ref={mount} />;
}
