// The three explorer illustrations activate together. Real DOM labels and SVG
// emblems remain usable while an image is unavailable or the network is offline.
import {fetchJson} from './runtime_data.js';

export async function loadMapUiArt(mode,read=fetchJson){
 const manifest=await read('data/adventure/map-ui.json'),rules=[];
 await Promise.all(['banner','haqi','earth'].map(async id=>{
  const row=manifest.assets?.[id],url=mode==='local'?row?.local:row?.cdn;
  if(!url||(mode!=='local'&&!url.startsWith('https://cdn.keepwork.com/')))throw Error('地图插画尚未配置可用的资源地址');
  const picture=new Image();picture.crossOrigin='anonymous';
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{picture.onload=picture.onerror=null;reject(Error('地图插画加载超时'));},8000);
   picture.onload=()=>{clearTimeout(timer);resolve();};
   picture.onerror=()=>{clearTimeout(timer);reject(Error('地图插画加载失败'));};
   picture.src=url;
  });
  if(picture.naturalWidth!==row.width||picture.naturalHeight!==row.height)throw Error('地图插画尺寸不匹配');
  rules.push(`--ui-map-${id}:url(${JSON.stringify(new URL(url,document.baseURI).href)});`);
 }));
 const style=document.createElement('style');style.id='map-ui-art';
 style.textContent=`.storybook-ui{${rules.join('')}}`;
 document.getElementById(style.id)?.remove();document.head.append(style);
 document.documentElement.classList.add('map-art-ready');
 return manifest;
}
