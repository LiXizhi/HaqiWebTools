// Visual selection only. Never changes encounter rules, saves, RNG or rewards.
export const BATTLE_SCENES={beach:{name:'晴日海滩',disk:'disk-a'},forest:{name:'林间营地',disk:'disk-c'},snow:{name:'雪山谷地',disk:'disk-b'},academy:{name:'学院庭院',disk:'disk-a'},canyon:{name:'赤岩峡谷',disk:'disk-c'},starlight:{name:'星夜密林',disk:'disk-b'}};
const biomes={beach:'beach',coast:'beach',snow:'snow',ice:'snow',town:'academy',forest:'forest',park:'forest',farm:'forest',oasis:'forest',gold:'forest',lake:'forest',grass:'forest',dark:'starlight',marsh:'starlight',ash:'canyon',volcanic:'canyon',desert:'canyon'};
const islands={camp:'forest',town:'academy',ice:'snow',fire:'canyon',desert:'canyon',dark:'starlight',tide:'beach',float:'starlight',sail:'beach',hanzi:'forest',earth:'academy'};
export function battleSceneFor(save,content){
 const zone=save.pendingEncounter?.zone||save.zone;
 const regions=content.worldMaps?.[zone]?.regions||[];
 const point=save.position||{};
 const nearest=regions.reduce((best,row)=>{
  const d=((point.x-row.x)/row.rx)**2+((point.y-row.y)/row.ry)**2;
  return Number.isFinite(d)&&d<(best?.d??Infinity)?{row,d}:best;
 },null);
 const id=(nearest&&nearest.d<=1?biomes[nearest.row.biome]:null)||islands[zone]||'forest';
 return {id,...BATTLE_SCENES[id]};
}
export function battleArtMode(hostname,search=''){
 const query=new URLSearchParams(search);
 // Explicit preview scope: never accidentally ship a localhost path online.
 if(['localhost','127.0.0.1','[::1]'].includes(hostname)&&query.get('battleArt')==='local')return 'local';
 return query.get('assets')==='local'?'local':'cdn';
}
export function battleDiskRect(cx,cy,r){return {x:cx-r,y:cy-r*.54,w:r*2,h:r*1.08};}
