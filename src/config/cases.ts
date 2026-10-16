import { createChestAppearance, type ChestAppearance } from '../domain/chest-appearance.ts';
import { copyModificationProfile, type ChestModificationProfile } from '../domain/chest-modifications.ts';
import { ENDER_REFERENCE_MODIFICATIONS } from './ender-modifications.ts';

export interface CasePresentation {
  readonly brand: string; readonly collection: string; readonly title: string; readonly description: string;
}
export interface ChestModelDefinition {
  readonly revision: string; readonly path: string; readonly body: string; readonly lid: string; readonly key?: string;
  readonly openingClips: readonly string[]; readonly rotationY: number;
  /** Server-configured parts, colour zones and modification catalogue of this model. */
  readonly modifications: ChestModificationProfile;
}
export type CaseRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export const CASE_RARITY_LABELS: Readonly<Record<CaseRarity, string>> = Object.freeze({
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary',
});
export interface CaseDefinition {
  readonly rarity: CaseRarity; readonly appearance: ChestAppearance;
  readonly id: string; readonly collectionId: string; readonly presentation: CasePresentation;
  readonly model: ChestModelDefinition; readonly catalogPath: string; readonly prizePath: string;
  readonly poster: string;
}
export const ENDER_CASE: CaseDefinition = Object.freeze({
  appearance: createChestAppearance(),
  id: 'ender', collectionId: 'the-end', rarity: 'rare',
  presentation: Object.freeze({ brand: 'Voxel Vault', collection: 'Коллекция Края', title: 'Сокровища Эндера',
    description: 'Тайны другого измерения. Открой сундук и найди свой артефакт.' }),
  model: Object.freeze({ revision: 'ender-reference', path: 'models/ender-chest.glb', body: 'Chest_bottom', lid: 'Chest_top',
    openingClips: Object.freeze(['Open']), rotationY: Math.PI,
    modifications: copyModificationProfile(ENDER_REFERENCE_MODIFICATIONS) }),
  catalogPath: 'items.json', prizePath: 'selected_prize.json', poster: 'images/cases/ender.png',
});
export const CASES: readonly CaseDefinition[] = Object.freeze([ENDER_CASE]);
