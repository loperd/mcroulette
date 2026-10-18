/**
 * The blocks a world is made of. Every block fills exactly one cell of the grid; its model decides
 * how it is drawn inside that cell: a full cube, a cross of two planes (flowers, grass), a torch, or
 * a liquid surface. Ids are given in registration order, 0 is air.
 */
export type BlockModel = 'cube' | 'cross' | 'torch' | 'liquid';

export interface BlockDefinition {
  readonly name: string;
  readonly model?: BlockModel;
  /** Atlas tiles: `all`, or per face `top` / `bottom` / `side`. */
  readonly textures: { readonly all?: string; readonly top?: string; readonly bottom?: string; readonly side?: string };
  /**
   * Light and neighbouring faces pass through (leaves, glass). A cube that is not transparent is
   * opaque: it stops light and hides the faces of its neighbours.
   */
  readonly transparent?: boolean;
  /** Pixels with no alpha are holes (leaves): drawn in the opaque pass with alpha test. */
  readonly cutout?: boolean;
  /** Light it gives, 0..15 (torch 14, lava 15, glowstone 15). */
  readonly light?: number;
}

export interface Block extends Required<Omit<BlockDefinition, 'textures'>> {
  readonly id: number;
  readonly textures: { readonly top: string; readonly bottom: string; readonly side: string };
  /** Stops light and hides neighbouring faces. */
  readonly opaque: boolean;
}

export class BlockRegistry {
  private readonly blocks: Block[] = [];
  private readonly ids = new Map<string, number>();

  constructor(definitions: readonly BlockDefinition[]) {
    for (const definition of definitions) {
      const id = this.blocks.length + 1, model = definition.model ?? 'cube', t = definition.textures;
      const side = t.side ?? t.all ?? 'stone';
      const block: Block = {
        id, name: definition.name, model,
        textures: { top: t.top ?? t.all ?? side, bottom: t.bottom ?? t.all ?? t.top ?? side, side },
        transparent: definition.transparent ?? model !== 'cube', cutout: definition.cutout ?? false,
        light: Math.max(0, Math.min(15, definition.light ?? 0)),
        opaque: model === 'cube' && !(definition.transparent ?? false),
      };
      if (this.ids.has(block.name)) throw new Error(`Block "${block.name}" is defined twice.`);
      this.blocks.push(block); this.ids.set(block.name, id);
    }
  }

  /** The id of a block by name; throws on a typo rather than silently placing air. */
  id(name: string): number {
    const id = this.ids.get(name);
    if (id === undefined) throw new Error(`Unknown block "${name}".`);
    return id;
  }

  get(id: number): Block | undefined { return id > 0 ? this.blocks[id - 1] : undefined; }
}
