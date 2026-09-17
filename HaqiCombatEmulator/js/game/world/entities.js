// Overworld entities for one world: player, placed NPCs, arena mobs and portals in map pixel space.
const MENTOR_HINT=/导师|魔法学院/;
// Haqi kids mentors: 水=寒冰 ice, 火 fire, 金 storm, 木 life, 土 death.
export const MENTOR_ASSET={fire:'fire',ice:'water',storm:'metal',life:'wood',death:'earth'};
const PORTRAITS={30401:'haqiland_icemagicteacher_32bits',30402:'haqiland_firemagicteacher_32bits',30398:'haqiland_stormmagicteacher_32bits',30399:'haqiland_lifemagicteacher_32bits',30400:'haqiland_deathmagicteacher_32bits',30430:'haqiland_godbeanshop_32bits',30431:'haqiland_specialshop_32bits',30432:'haqiland_exchangemoneyshop_32bits',30042:'haqiland_susushop_32bits',30530:'haqiland_magicclown_32bits',30421:'haqiland_redmushroommanager_32bits',30428:'haqiland_redmushroommanager_32bits',30112:'haqiland_balancemagicteacher_32bits'};
export function npcPortrait(npc){const key=PORTRAITS[npc.id];return key?`texture/aries/npcs/portrait/${key}.png`:null;}
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export const PLAYER_SPEED=110;
export function npcSprite(npc) {
  if(npc.kind==='object')return npc.hasDialog?'prop_sign':'prop_crate';
  if(npc.kind==='creature')return `mob_generic_${['fire','ice','storm','life','death'][hash(npc.id)%5]}`;
  const asset=(npc.assetChar??'').toLowerCase();
  const mentor=['fire','ice','storm','death','life'].find(s=>asset.includes(`mentor_${MENTOR_ASSET[s]}`));
  if(mentor||MENTOR_HINT.test(npc.place))return `mentor_${mentor??['fire','ice','storm','death','life'][hash(npc.id)%5]}`;
  return `villager_${'abcdef'[hash(npc.id)%6]}`;
}
export function mobSprite(mob,available) {
  for(const key of [`mob_${mob.key}`,`mob_${mob.stem??mob.key}`])if(available.has(key))return key;
  const generic=`mob_generic_${mob.school}`;
  return available.has(generic)?generic:'mob_generic_bee';
}
export function createEntities(data,world,worldMap,spriteNames,profile) {
  const npcs=(data.npcs[world.name]??[]).map(n=>{const [x,y]=worldMap.toMap(n.pos[0],n.pos[2]);return {type:'npc',id:n.id,name:n.name,title:n.title,x,y,dir:'down',sprite:npcSprite(n),data:n,radius:n.kind==='object'?10:12};});
  const mobs=[];
  for(const arena of data.arenas[world.name]??[]) {
    const template=data.mobByTemplate[arena.mobs[0]];
    if(!template)continue;
    const [x,y]=worldMap.toMap(arena.pos[0],arena.pos[2]);
    const party=arena.mobs.map(t=>data.mobByTemplate[t]).filter(Boolean);
    mobs.push({type:'mob',id:`arena-${arena.id}`,arenaId:arena.id,name:template.name,level:template.level,school:template.school,x,y,homeX:x,homeY:y,dir:'down',frame:0,sprite:mobSprite(template,spriteNames),mob:template,party,alive:true,respawnAt:0,respawn:Math.max(5000,arena.respawn),wander:{tx:x,ty:y,wait:Math.random()*2},range:Math.max(18,template.walkRange*worldMap.fit.pixelsPerUnit*worldMap.scale*1.6),radius:14});
  }
  const portals=(world.portals??[]).map(p=>{const [x,y]=worldMap.toMap(p.pos[0],p.pos[2]);return {type:'portal',id:p.id,name:p.name,x,y,gsid:p.gsid,radius:14};});
  const start=profile.pos&&profile.world===world.name?[profile.pos.x,profile.pos.y]:worldMap.born;
  const player={type:'player',id:'player',name:profile.name,x:start[0],y:start[1],dir:'down',frame:0,walk:0,moving:false,sprite:`player_${profile.gender}_${profile.school}`,target:null,radius:6};
  return {npcs,mobs,portals,player,all(){return [...npcs,...mobs.filter(m=>m.alive),...portals,player];}};
}
export function updateMobs(entities,collision,dt,now) {
  for(const m of entities.mobs) {
    if(!m.alive){if(now>=m.respawnAt){m.alive=true;m.x=m.homeX;m.y=m.homeY;}continue;}
    const w=m.wander;
    if(w.wait>0){w.wait-=dt;m.frame=0;continue;}
    const dx=w.tx-m.x,dy=w.ty-m.y,dist=Math.hypot(dx,dy);
    if(dist<2){w.wait=1+Math.random()*3;const a=Math.random()*Math.PI*2,r=Math.random()*m.range;w.tx=m.homeX+Math.cos(a)*r;w.ty=m.homeY+Math.sin(a)*r;continue;}
    const speed=28,step=Math.min(dist,speed*dt);
    const [nx,ny]=collision.move(m.x,m.y,dx/dist*step,dy/dist*step,3);
    if(Math.abs(nx-m.x)<1e-3&&Math.abs(ny-m.y)<1e-3){w.wait=.5;w.tx=m.homeX;w.ty=m.homeY;}
    m.dir=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'up':'down');
    m.x=nx;m.y=ny;m.frame=(m.frame+dt*6)%4;
  }
}
export function movePlayer(player,axis,collision,dt,speed=PLAYER_SPEED) {
  let [ax,ay]=axis;
  if(player.target){const dx=player.target.x-player.x,dy=player.target.y-player.y,d=Math.hypot(dx,dy);if(d<4||(ax||ay)){player.target=null;}else{ax=dx/d;ay=dy/d;}}
  if(!ax&&!ay){player.moving=false;player.frame=0;return;}
  const [nx,ny]=collision.move(player.x,player.y,ax*speed*dt,ay*speed*dt,4);
  if(Math.abs(nx-player.x)<1e-4&&Math.abs(ny-player.y)<1e-4&&player.target)player.target=null;
  player.x=nx;player.y=ny;player.moving=true;player.walk=(player.walk+dt*8)%4;player.frame=Math.floor(player.walk);
  player.dir=Math.abs(ax)>Math.abs(ay)?(ax<0?'left':'right'):(ay<0?'up':'down');
}
export function nearest(entities,x,y,types,maxDist) {
  let best=null,bestD=maxDist;
  for(const e of entities.all()){if(!types.includes(e.type))continue;const d=Math.hypot(e.x-x,e.y-y);if(d<bestD){best=e;bestD=d;}}
  return best;
}
export function pick(entities,x,y) {
  const order=[...entities.all()].filter(e=>e.type!=='player').sort((a,b)=>b.y-a.y);
  return order.find(e=>Math.abs(e.x-x)<=e.radius+6&&y<=e.y+8&&y>=e.y-34)??null;
}
