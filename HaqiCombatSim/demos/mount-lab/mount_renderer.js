import {resolvePose} from './mount_core.js';
import {HeroRenderer} from '../../js/hero_renderer.js';

export async function loadArt(manifest, {local = false, baseURL = import.meta.url} = {}) {
  const entries = await Promise.all(Object.entries(manifest).map(async ([id, asset]) => {
    const src = local ? new URL(asset.local, baseURL).href : asset.cdn;
    if (!src) throw new Error(`${id} 未登记 CDN；离线预览请使用 ?assets=local`);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`美术加载失败：${id}`));
      image.src = src;
    });
    if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw new Error(`${id} 图集尺寸不符`);
    return [id, image];
  }));
  const images=new Map(entries);
  const response=await fetch(new URL('../../data/adventure/hero-art.json',import.meta.url));
  if(!response.ok)throw new Error('主角图集清单不可用');
  images.hero=new HeroRenderer(await response.json(),{mounts:[]},{local});
  for(const [id,image] of images)images.hero.images.set('mount:'+id,image);
  await Promise.all(['male','female'].map(gender=>images.hero.ensure({gender})));
  return images;
}

function sprite(ctx, images, item) {
  const image = images.get(item.art);
  if (!image) throw new Error(`缺少图集：${item.art}`);
  const w = image.width / 2, h = image.height / 2;
  ctx.drawImage(image, item.cell % 2 * w, Math.floor(item.cell / 2) * h, w, h, item.x, item.y, item.w, item.h);
}

// The host owns world position and y-sorting; this renderer draws one actor at (0,0).
export function drawMount(ctx, images, mount, direction, options = {}) {
  const pose = resolvePose(mount, direction, options);
  ctx.save();
  if (options.shadow !== false) {
    ctx.fillStyle = '#153b3230'; ctx.beginPath();
    ctx.ellipse(0, 0, pose.mount.w * (pose.showMount ? .26 : .1), pose.mount.w * .035, 0, 0, Math.PI * 2); ctx.fill();
  }
  if(!pose.showRider&&pose.showMount)sprite(ctx,images,pose.mount);
  if(pose.showRider)images.hero.draw(ctx,{gender:options.gender||'male',mount:pose.showMount?mount:null},{...options,facing:['down','left','right','up'].indexOf(direction),pose:{...pose,key:pose.rider.art,mount:pose.showMount?pose.mount:null,foreground:options.occlusion===false?[]:pose.foreground}});
  if (options.debug && pose.showMount) {
    ctx.strokeStyle = '#c16b33'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(pose.mount.x, pose.mount.y, pose.mount.w, pose.mount.h);
    for (const polygon of pose.foreground) {
      ctx.beginPath(); polygon.forEach(([u,v], i) => ctx[i ? 'lineTo' : 'moveTo'](pose.mount.x + u * pose.mount.w, pose.mount.y + v * pose.mount.h));
      ctx.closePath(); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.strokeStyle = '#db3344'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pose.seat[0]-7, pose.seat[1]); ctx.lineTo(pose.seat[0]+7, pose.seat[1]);
    ctx.moveTo(pose.seat[0], pose.seat[1]-7); ctx.lineTo(pose.seat[0], pose.seat[1]+7); ctx.stroke();
  }
  ctx.restore();
  return pose;
}
