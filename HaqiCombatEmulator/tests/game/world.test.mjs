import test from 'node:test';
import assert from 'node:assert/strict';
import {game,hasAsset} from '../fixtures/game.mjs';
import {fitAffine,createWorldMap} from '../../js/game/world/map.js';
import {classifyPixel,buildMask,carve,createCollision} from '../../js/game/world/collision.js';
import {playableWorlds} from '../../js/game/quest/quests.js';
test('anchor fit: every calibrated world maps its anchors back within the hand-placement noise',()=>{
  const calibrated=game.worlds.filter(w=>w.anchors.length>=3);
  assert.ok(calibrated.length>=4);
  for(const w of calibrated){
    const fit=fitAffine(w.anchors);
    // Source anchors are hand-placed on a 1024x512 image; the playable islands stay under ~50 px.
    const limit=w.name==='FrostRoarIsland'?100:50;
    assert.ok(fit.maxResidual<limit,`${w.name}: max residual ${fit.maxResidual}`);
    assert.ok(fit.meanResidual<limit/2,`${w.name}: mean residual ${fit.meanResidual}`);
    assert.ok(fit.pixelsPerUnit>0.3&&fit.pixelsPerUnit<0.6,`${w.name}: ${fit.pixelsPerUnit} px per world unit`);
    for(const a of w.anchors){const [wx,wz]=fit.toWorld(...fit.toMap(...a.world));assert.ok(Math.hypot(wx-a.world[0],wz-a.world[1])<1e-6,'round trip');}
  }
});
test('anchor fit: degenerate input is rejected',()=>{
  assert.throws(()=>fitAffine([{map:[0,0],world:[0,0]},{map:[1,1],world:[1,1]}]),/锚点/);
  assert.throws(()=>fitAffine([{map:[0,0],world:[0,0]},{map:[1,0],world:[1,1]},{map:[2,0],world:[2,2]}]),/锚点/);
});
test('world map: born position lands inside the scaled image for playable worlds',()=>{
  const playable=playableWorlds(game,hasAsset);
  assert.deepEqual(playable.map(w=>w.name),['61HaqiTown','FlamingPhoenixIsland']);
  for(const w of playable){const wm=createWorldMap(w,{width:1024,height:512,scale:3});const [x,y]=wm.born;assert.ok(x>0&&x<wm.width&&y>0&&y<wm.height,`${w.name} born ${x},${y}`);
    const all=[...(game.npcs[w.name]??[]),...(game.arenas[w.name]??[])];const inside=all.filter(e=>{const [px,py]=wm.toMap(e.pos[0],e.pos[2]);return px>=0&&px<wm.width&&py>=0&&py<wm.height;});
    assert.ok(inside.length/all.length>0.95,`${w.name}: ${inside.length}/${all.length} entities inside the map`);}
});
test('world map: the tutorial island is not playable because its page is a stale copy',()=>{
  const tutorial=game.worldByName.NewUserIsland;
  assert.equal(tutorial.mapImage,null);assert.equal(tutorial.anchors.length,0);
});
test('collision: sea/parchment blocked, land walkable, carving and sliding movement',()=>{
  const w=4,h=4,px=new Uint8ClampedArray(w*h*4);
  const put=(x,y,rgba)=>px.set(rgba,(y*w+x)*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)put(x,y,[60,140,60,255]);
  put(0,0,[40,90,170,255]);put(1,0,[0,0,0,0]);put(2,0,[230,215,170,255]);
  assert.equal(classifyPixel(40,90,170,255),0);assert.equal(classifyPixel(60,140,60,255),1);assert.equal(classifyPixel(0,0,0,0),0);
  const mask=buildMask(px,w,h);
  assert.deepEqual([...mask.slice(0,4)],[0,0,0,1]);
  carve(mask,w,h,[[0,0]],1);assert.equal(mask[0],1);
  const col=createCollision(mask,w,h,10);
  assert.equal(col.walkable(35,35),true);assert.equal(col.walkable(25,5),false);
  assert.deepEqual(col.move(35,15,-40,0,4),[35,15],'blocked by the map edge');
  assert.deepEqual(col.move(35,15,-10,0,4),[25,15],'free move');
  assert.deepEqual(col.move(25,15,0,-10,4),[25,15],'parchment above blocks');
  assert.deepEqual(col.move(35,25,-10,10,4),[25,35],'diagonal resolves per axis');
});
