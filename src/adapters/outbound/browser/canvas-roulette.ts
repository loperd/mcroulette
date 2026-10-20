import type { RoulettePresentationPort } from '../../../application/ports/roulette-presentation.ts';
import type { Item } from '../../../domain/item.ts';
import { positionAt, type SpinPlan } from '../../../domain/spin-plan.ts';
import { assertTarget, type TargetSelection } from '../../../domain/strip.ts';
import { waitFor } from '../../../application/cancellation.ts';
import { browserFrameEnvironment, type FrameEnvironment } from './frame-scheduler.ts';
import { FrameTimeline } from './frame-timeline.ts';
import { rouletteThemes, type RouletteTheme } from './roulette-theme.ts';
import type { ClickSound } from './click-sound.ts';

const STRIDE = 200, CARD_WIDTH = 184, CARD_HEIGHT = 164;
const COLORS = { common: ['#5e7482', '#3d4f5b'], uncommon: ['#005bff', '#0c5399'], rare: ['#8846c7', '#671ab4'], epic: ['#c22ec9', '#86178c'], legendary: ['#da3217', '#9a1616'] } as const;
type Card = HTMLCanvasElement;

export interface CanvasRouletteOptions {
  readonly theme?: RouletteTheme;
  readonly environment?: FrameEnvironment;
  readonly sound?: Pick<ClickSound, 'tick' | 'stop'>;
  readonly createCanvas?: () => HTMLCanvasElement;
  readonly loadImage?: (url: string, signal: AbortSignal) => Promise<HTMLImageElement>;
}

/** One visible surface; the lens and background sample the same logical strip. */
export class CanvasRoulette implements RoulettePresentationPort {
  readonly element: HTMLCanvasElement;
  private readonly document: Document;
  private readonly timeline: FrameTimeline;
  private readonly options: CanvasRouletteOptions;
  private readonly cards = new Map<string, Card>();
  private context?: CanvasRenderingContext2D;
  private selection?: TargetSelection;
  private strip: readonly Card[] = [];
  private operation?: AbortController;
  private observer?: ResizeObserver;
  private detachResize?: () => void;
  private position = 0;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private generation = 0;
  private disposed = false;

  constructor(document: Document, options: CanvasRouletteOptions = {}) {
    if (!document.defaultView) throw new Error('The roulette requires a browser window.');
    this.document = document; this.options = options;
    this.element = this.createCanvas();
    this.element.className = 'roulette roulette--canvas'; this.element.hidden = true;
    this.element.setAttribute('aria-hidden', 'true');
    this.timeline = new FrameTimeline(options.environment ?? browserFrameEnvironment(document.defaultView, document));
  }

  async prepare(signal: AbortSignal): Promise<void> {
    this.assertAlive(signal);
    if (this.context) return;
    this.context = this.getContext(this.element);
    const resize = () => { if (!this.disposed) this.paint(); };
    const Observer = (this.document.defaultView as Window & typeof globalThis).ResizeObserver;
    if (Observer) { this.observer = new Observer(resize); this.observer.observe(this.element); }
    this.document.defaultView!.addEventListener('resize', resize);
    this.detachResize = () => this.document.defaultView!.removeEventListener('resize', resize);
  }

  async spin(selection: TargetSelection, plan: SpinPlan, signal: AbortSignal): Promise<void> {
    this.assertAlive(signal); assertTarget(selection);
    if (plan.slotCount !== selection.slots.length || plan.targetIndex !== selection.targetIndex) {
      throw new Error('The spin plan does not match its target.');
    }
    const generation = ++this.generation;
    this.operation?.abort(new Error('The animation was replaced.'));
    this.timeline.cancel(new Error('The animation was replaced.'));
    const operation = new AbortController(); this.operation = operation;
    const abort = () => operation.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    this.options.sound?.stop();
    this.element.hidden = true;
    this.selection = undefined; this.strip = [];
    try {
      await this.prepare(operation.signal);
      await this.prepareCards(selection, operation.signal);
      this.assertAlive(operation.signal);
      this.selection = selection; this.position = plan.startPosition;
      this.strip = selection.slots.map(slot => this.cards.get(this.key(slot.item))!);
      this.element.hidden = false; this.element.style.opacity = '1';
      const reducedMotion = this.document.defaultView!.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let previousSlot = Math.floor(this.position);
      await this.timeline.run(reducedMotion ? 0 : plan.durationSeconds, elapsed => {
        this.position = positionAt(plan, reducedMotion ? plan.durationSeconds : elapsed);
        const slot = Math.floor(this.position);
        if (!reducedMotion && slot !== previousSlot) this.options.sound?.tick();
        previousSlot = slot; this.paint();
      }, operation.signal);
    } catch (error) {
      if (generation === this.generation) this.reset();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      if (this.operation === operation) this.operation = undefined;
    }
  }

  async prepareSpin(selection: TargetSelection, signal: AbortSignal): Promise<void> {
    this.assertAlive(signal); assertTarget(selection);
    await this.prepare(signal);
    await this.prepareCards(selection, signal);
  }

  reset(): void {
    this.generation += 1;
    this.operation?.abort(new Error('The animation was cancelled.')); this.operation = undefined;
    this.timeline.cancel(); this.options.sound?.stop(); this.selection = undefined; this.strip = [];
    this.element.hidden = true; this.element.style.opacity = '1';
    this.context?.clearRect(0, 0, this.width, this.height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.reset(); this.timeline.dispose();
    this.observer?.disconnect(); this.observer = undefined;
    this.detachResize?.(); this.detachResize = undefined;
    this.clearCards(); this.element.width = 0; this.element.height = 0;
    this.context = undefined; this.element.remove();
  }

  private async prepareCards(selection: TargetSelection, signal: AbortSignal): Promise<void> {
    const items = [...new Map(selection.slots.map(slot => [this.key(slot.item), slot.item])).values()];
    const wanted = new Set(items.map(item => this.key(item)));
    for (const [key, card] of this.cards) if (!wanted.has(key)) {
      this.releaseCard(card); this.cards.delete(key);
    }
    const queue = items.filter(item => !this.cards.has(this.key(item)));
    await Promise.all(Array.from({ length: Math.min(queue.length, 4) }, async () => {
      while (queue.length) {
        signal.throwIfAborted();
        const item = queue.shift()!;
        const image = await waitFor((this.options.loadImage ?? this.loadImage)(item.image, signal), signal);
        signal.throwIfAborted();
        this.cards.set(this.key(item), this.createCard(item, image));
      }
    }));
  }

  private createCard(item: Item, image: HTMLImageElement): Card {
    const normal = this.createCanvas();
    // A small, fixed-resolution cache; no text layout or image decode in the frame loop.
    const ratio = 2;
    normal.width = CARD_WIDTH * ratio; normal.height = CARD_HEIGHT * ratio;
    const context = this.getContext(normal); context.scale(ratio, ratio);
    const theme = rouletteThemes[this.options.theme ?? 'ender'];
    const surface = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    surface.addColorStop(0, '#172536'); surface.addColorStop(1, theme.card);
    context.fillStyle = surface; context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    context.strokeStyle = 'rgba(116, 190, 232, .34)'; context.lineWidth = 1;
    context.strokeRect(0.5, 0.5, CARD_WIDTH - 1, CARD_HEIGHT - 1);
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (width <= 0 || height <= 0) throw new Error(`The prize image ${item.id} has no dimensions.`);
    const scale = Math.min((CARD_WIDTH - 20) / width, (CARD_HEIGHT - 16) / height);
    context.drawImage(image, (CARD_WIDTH - width * scale) / 2, (CARD_HEIGHT - height * scale) / 2, width * scale, height * scale);
    const colors = COLORS[item.rarity];
    const gradient = context.createLinearGradient(0, 0, CARD_WIDTH, 0);
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
    context.fillStyle = gradient; context.fillRect(0, CARD_HEIGHT - theme.stripe, CARD_WIDTH, theme.stripe);
    return normal;
  }

  private paint(): void {
    if (!this.context || !this.selection || this.disposed) return;
    const bounds = this.element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const ratio = Math.min(this.document.defaultView!.devicePixelRatio || 1, 2);
    if (this.width !== bounds.width || this.height !== bounds.height || this.ratio !== ratio) {
      this.width = bounds.width; this.height = bounds.height; this.ratio = ratio;
      this.element.width = Math.ceil(this.width * ratio); this.element.height = Math.ceil(this.height * ratio);
    }
    const context = this.context;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, this.width, this.height);
    this.drawStrip();
  }

  private drawStrip(): void {
    const selection = this.selection!, context = this.context!, visibleWidth = this.width;
    const first = Math.floor(this.position - visibleWidth / (2 * STRIDE)) - 1;
    const count = Math.ceil(visibleWidth / STRIDE) + 4;
    for (let index = 0; index < count; index++) {
      const logical = first + index;
      const slot = ((logical % selection.slots.length) + selection.slots.length) % selection.slots.length;
      const card = this.strip[slot]!;
      const x = this.width / 2 + (logical - this.position) * STRIDE + (STRIDE - CARD_WIDTH) / 2;
      const y = this.height * 0.44 - CARD_HEIGHT / 2;
      const centerDistance = Math.abs(x + CARD_WIDTH / 2 - this.width / 2);
      context.globalAlpha = Math.max(0.55, 1 - centerDistance / (CARD_WIDTH * 2.1));
      context.drawImage(card, x, y, CARD_WIDTH, CARD_HEIGHT);
    }
    context.globalAlpha = 1;
  }

  private readonly loadImage = (url: string, signal: AbortSignal): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = this.document.createElement('img');
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(signal.reason); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error(`The roulette image could not be loaded: ${url}`)); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    image.src = url;
  });

  private key(item: Item): string { return JSON.stringify([item.id, item.image, item.rarity]); }
  private createCanvas(): HTMLCanvasElement { return this.options.createCanvas?.() ?? this.document.createElement('canvas'); }
  private getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available.');
    return context;
  }
  private releaseCard(card: Card): void {
    card.width = 0; card.height = 0;
  }
  private clearCards(): void { for (const card of this.cards.values()) this.releaseCard(card); this.cards.clear(); }
  private assertAlive(signal: AbortSignal): void {
    signal.throwIfAborted(); if (this.disposed) throw new Error('The roulette has been disposed.');
  }
}
