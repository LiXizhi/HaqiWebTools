// Keepwork CDN art loader. URL = base + full manifest line ("path.png.p,md5,size").
// Only raw PNG/JPG ".p" entries are used; zipped ".z" assets are never requested.
let index=null,indexPromise=null;
const images=new Map();
const CACHE='haqi-cdn-v1';
export function normalizeAssetPath(path) {
  return String(path??'').replace(/\\/g,'/').replace(/^\/+/,'').toLowerCase().replace(/\.dds$/,'.png').replace(/;.*$/,'').trim();
}
export async function loadAssetIndex(url=new URL('../../../data/game/asset-index.json',import.meta.url)) {
  if(index)return index;
  indexPromise??=fetch(url).then(async r=>{if(!r.ok)throw new Error(`资源索引加载失败 (${r.status})`);const data=await r.json();if(data.schemaVersion!==1||!data.assets)throw new Error('资源索引格式不兼容');index=data;return data;});
  return indexPromise;
}
export function setAssetIndex(data){index=data;indexPromise=Promise.resolve(data);}
export function assetLine(path){return index?.assets[normalizeAssetPath(path)]??null;}
export function assetURL(path) {
  const line=assetLine(path);
  return line?index.base+line:null;
}
export function hasAsset(path){return !!assetLine(path);}
export function findAssets(prefix){const p=normalizeAssetPath(prefix);return index?Object.keys(index.assets).filter(k=>k.startsWith(p)):[];}
async function fetchBlob(url) {
  let cache=null;
  try{cache=typeof caches!=='undefined'?await caches.open(CACHE):null;}catch{cache=null;}
  if(cache){const hit=await cache.match(url);if(hit)return hit.blob();}
  const response=await fetch(url,{mode:'cors'});
  if(!response.ok)throw new Error(`CDN ${response.status}`);
  if(cache){try{await cache.put(url,response.clone());}catch{/* quota or opaque response; ignore */}}
  return response.blob();
}
async function decode(blob) {
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(blob);}catch{/* fall through */}}
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('图片解码失败'));};img.src=url;});
}
// Resolves to a drawable (ImageBitmap/Image) or null when the asset is unknown or the network fails.
// The resolved value is also stored on the entry so render loops can read it synchronously.
export function loadImage(path) {
  const key=normalizeAssetPath(path);
  if(!images.has(key)) {
    const entry={value:null,done:false};
    const url=assetURL(key);
    entry.promise=(url?fetchBlob(url).then(decode):Promise.resolve(null)).catch(e=>{console.warn('asset failed',key,e.message);return null;}).then(img=>{entry.value=img;entry.done=true;return img;});
    images.set(key,entry);
  }
  return images.get(key).promise;
}
export function preload(paths){return Promise.all(paths.map(loadImage));}
// Synchronous accessor for render loops: starts the load on first call, returns null until decoded.
export function drawable(path){const key=normalizeAssetPath(path);if(!images.has(key))loadImage(key);return images.get(key).value;}
export function isLoaded(path){return images.get(normalizeAssetPath(path))?.done??false;}
export function placeholder(width,height,color='#5b6b7a',label='') {
  const c=document.createElement('canvas');c.width=width;c.height=height;const g=c.getContext('2d');
  g.fillStyle=color;g.fillRect(0,0,width,height);g.strokeStyle='#ffffff55';g.strokeRect(.5,.5,width-1,height-1);
  if(label){g.fillStyle='#fff';g.font=`${Math.max(8,Math.floor(height/6))}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(label,width/2,height/2);}
  return c;
}
// Full 256x256 card frame for any of the card's gsids (kids ids first), skipping thumbnails.
export function cardFacePath(card,{thumb=false}={}) {
  for(const gsid of [...(card?.gsids??[])].sort((a,b)=>a-b)){for(const folder of ['item','item_teen']){const hits=findAssets(`texture/aries/${folder}/${gsid}_`).filter(k=>/_thumb/.test(k)===thumb);if(hits.length)return hits[0];}}
  return null;
}
export function itemIconPath(item){return item?.icon?normalizeAssetPath(item.icon):null;}
