// Reuses the shipped camp prop atlas so the grass bed reads as a place to gather.
export function drawForgeCommissionSite(ctx,assets,site,phase,label){
 assets.environmentArt?.draw(ctx,'campProps','flowerBed',site.x-45,site.y-24,90,40);
 assets.environmentArt?.draw(ctx,'campProps','lushBush',site.x-29,site.y-57,58,49);
 const active=phase==='gather';
 label(site.name,site.x,site.y+24,active);
 label(active?'按配方辨认草药':'轻露茶的材料在这里',site.x,site.y+47,false);
}
