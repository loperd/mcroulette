/**
 * @voxel-vault/blockworld — Minecraft-style block worlds on three.js.
 *
 *   const blocks = new BlockRegistry([{ name: 'grass', textures: { top: 'grass_top', side: 'grass_side', bottom: 'dirt' } }, ...]);
 *   const world = new BlockWorld(64, 32, 64, [-32, 0, -48]);
 *   world.set(x, y, z, blocks.id('grass'));
 *   computeLight(world, blocks);
 *   const { texture, uv } = blockAtlas();
 *   const meshes = worldMeshes(meshWorld(world, blocks, { uv }), texture);
 *   new BlockView(element, { id: 'meadow', build: () => ({ root, living, sky, fog, camera }) });
 */
export { BlockRegistry, type Block, type BlockDefinition, type BlockModel } from './blocks.ts';
export { BlockWorld } from './world.ts';
export { computeLight } from './light.ts';
export { meshWorld, brightness, FACES, type MeshArrays, type MeshOptions, type WorldMesh } from './mesher.ts';
export { blockAtlas, TILE, type TileName } from './atlas.ts';
export { BlockView, preloadStage, worldMeshes, geometry, type BlockRenderMetrics, type GraphicsMode, type Guest, type GuestWorld, type Living, type Stage, type StageBuilder, type StageContext } from './view.ts';
export { raw } from './color.ts';
export { WorldPhysics, physicsReady, type Body, type BodyBox, type BodyPose, type BodySpec, type PhysicsGround, type Vec } from './physics.ts';
