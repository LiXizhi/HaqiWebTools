// The spawn shortcut is background interaction. Visible actors/props win,
// preserving their existing back-to-front order and transparent pixel tests.
export function homeSceneHit(hits,point){
 let portal;
 for(let i=hits.length-1;i>=0;i--){
  const h=hits[i];
  if(point.sx<h.sx||point.sx>h.sx+h.sw||point.sy<h.sy||point.sy>h.sy+h.sh||(h.pixelHit&&!h.pixelHit(point.sx,point.sy)))continue;
  if(h.kind==='portal'){portal??=h;continue;}
  return h;
 }
 return portal;
}
