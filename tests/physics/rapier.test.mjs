import assert from 'node:assert/strict';
import test from 'node:test';
import { createRapierPhysicsWorld } from '../../src/adapters/outbound/chest/rapier-physics-world.ts';
import { PREVIEW_DROP_POSE, SPAWN_POSE } from '../../src/adapters/outbound/chest/physics-config.ts';

const boxes=[
  {center:{x:0,y:0,z:0},halfExtents:{x:0.5,y:0.5,z:0.5}},
  {center:{x:0,y:0.6,z:0},halfExtents:{x:0.5,y:0.15,z:0.5}},
];
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-5);

test('real Rapier WASM drops a compound chest onto the floor without tunneling',async()=>{
  const world=await createRapierPhysicsWorld(new AbortController().signal);
  try{
    world.resetChest(boxes,SPAWN_POSE);const initial=world.readChestPose();
    for(let frame=0;frame<240;frame++)world.step(1/60);
    const settled=world.readChestPose();
    assert.ok(settled.position.y<initial.position.y);
    assert.ok(settled.position.y>=0.45&&settled.position.y<1.2);
    assert.ok(Object.values(settled.position).every(Number.isFinite));
    assert.deepEqual(world.diagnostics(),{bodies:2,colliders:3});
    for(let frame=0;frame<660&&!world.isChestSleeping();frame++)world.step(1/60);
    assert.equal(world.isChestSleeping(),true,'opening requires a physically settled chest');
  }finally{world.dispose();}
});

test('100 real resets retain two bodies, three colliders and clear the previous velocity',async()=>{
  const world=await createRapierPhysicsWorld(new AbortController().signal);
  try{
    for(let cycle=0;cycle<100;cycle++){
      world.resetChest(boxes,SPAWN_POSE);
      assert.deepEqual(world.diagnostics(),{bodies:2,colliders:3});
      close(world.readChestPose().position.y,SPAWN_POSE.position.y);
      world.step(1/60);assert.ok(world.readChestPose().position.y>3.29);
      for(let frame=0;frame<30;frame++)world.step(1/60);
    }
  }finally{world.dispose();}
  assert.deepEqual(world.diagnostics(),{bodies:0,colliders:0});
  world.dispose();assert.throws(()=>world.step(1/60),/disposed/);
});

test('an aborted initialization cannot create a new world',async()=>{
  const abort=new AbortController();abort.abort();
  await assert.rejects(createRapierPhysicsWorld(abort.signal),{name:'AbortError'});
});

test('the preview fall from the sky lands, settles within seconds and stays on its block',async()=>{
  const world=await createRapierPhysicsWorld(new AbortController().signal);
  try{
    world.resetChest(boxes,PREVIEW_DROP_POSE);
    let frames=0;
    for(;frames<900&&!world.isChestSleeping();frames++)world.step(1/60);
    assert.equal(world.isChestSleeping(),true,'it comes to rest');
    assert.ok(frames<600,`settled in ${(frames/60).toFixed(1)}s`);
    const {position}=world.readChestPose();
    assert.ok(position.y>=0.45&&position.y<1.2,'on the ground');
    // The world puts it on the flat meadow around its block (1.7 units a block): it must not roll away.
    assert.ok(Math.hypot(position.x,position.z)<1.7,`stays by its block: ${position.x.toFixed(2)},${position.z.toFixed(2)}`);
  }finally{world.dispose();}
});
