// Uses the same shipped prop and equipment art as the close-up interaction.
// Labels and emphasis are provided by the world renderer's existing UI style.
export function drawForestCommissionSite(ctx,assets,site,appearance,label){
 if(!appearance)return;
 if(site.forestSite==='boots'){
  for(const [visible,id,dx] of [[appearance.boots,appearance.bootsArt,-25],[appearance.hat,appearance.hatArt,25]]){
   const art=visible&&assets.content.items[id]?.art;
   if(art)assets.draw(ctx,art,site.x+dx-22,site.y-43,44,44);
  }
 }else if(appearance.rock){
  assets.environmentArt?.draw(ctx,'campProps','mossBoulder',site.x-39,site.y-61,78,65);
 }
 label(site.name,site.x,site.y+20,appearance.active);
 label(appearance.label,site.x,site.y+43,false);
}
