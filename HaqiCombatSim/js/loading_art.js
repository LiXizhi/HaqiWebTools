import {fetchJson} from './runtime_data.js';
const cache=new Map();
// Optional, shared decoded artwork. Loading progress never waits for this image.
export function loadJourneyArtwork(mode='cdn'){
 if(typeof Image==='undefined')return Promise.resolve(null);
 const key=mode==='local'?'local':'cdn';if(cache.has(key))return cache.get(key);
 const pending=(async()=>{
  const row=await fetchJson('data/adventure/loading-art.json'),url=key==='local'?new URL('../'+row.local,import.meta.url).href:row.cdn;
  if(!url||key==='cdn'&&!url.startsWith('https://cdn.keepwork.com/'))return null;
  const image=new Image();image.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(Error('loading art timeout'));},6000);image.onload=()=>{clearTimeout(timer);resolve();};image.onerror=()=>{clearTimeout(timer);reject(Error('loading art unavailable'));};image.src=url;});
  if(image.naturalWidth!==row.width||image.naturalHeight!==row.height)return null;
  return url;
 })().catch(()=>{cache.delete(key);return null;});cache.set(key,pending);return pending;
}
