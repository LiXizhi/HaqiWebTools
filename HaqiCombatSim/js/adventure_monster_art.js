import {monsterArtBinding,validateMonsterArt} from './adventure_monster_art_core.js';
import {petStage} from './adventure_pets_core.js';
// Use existing image caches and frame redraws; no callbacks paint into a stale canvas transform.
export function createMonsterArtRenderer(art,content,draw,drawPet){
    validateMonsterArt(art,content.pets);
    return (ctx,monster,x,y,w,h)=>{
        const binding=monsterArtBinding(monster,art);
        if(binding?.kind==='portrait')return draw(ctx,{id:'monster:'+binding.id},x,y,w,h,true,false);
        if(binding?.kind==='pet')return drawPet(ctx,binding.petId,petStage(monster.level||1,content),x,y,w,h);
        return false;
    };
}
