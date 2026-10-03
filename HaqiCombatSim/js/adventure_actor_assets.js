import {monsterArtBinding} from './adventure_monster_art_core.js';
import {selectCompanionId,selectSocialPetId} from './adventure_companion_core.js';
import {streetPeopleProfiles} from './adventure_city_people_core.js';

// Explicit readiness barrier for filming; normal gameplay keeps lazy loading.
export async function warmSceneActors({world,save,socialActors=[],content,monsterArt,hero,ensureImage}) {
    const images=new Set();
    const add=ref=>{const id=typeof ref==='string'?ref:ref?.id;if(id)images.add(id);};
    const pet=id=>{if(id&&content.pets[id]?.art)add('pet:'+id);};
    for(const npc of world.npcs||[])if(!npc.character)add(npc.portrait);
    for(const encounter of world.encounters||[])for(const id of encounter.monsterIds||[encounter.monsterId]){
        const binding=monsterArtBinding(encounter.monster||content.monsters[id],monsterArt);
        if(binding?.kind==='portrait')add('monster:'+binding.id);
        else if(binding?.kind==='pet')pet(binding.petId);
        else add('creatures');
    }
    pet(selectCompanionId(save,content));
    for(const actor of socialActors)pet(selectSocialPetId(actor.profile,content));
    // Bound concurrency and deduplicate reused portraits/sheets across the island.
    const pending=[...images];let cursor=0;
    const worker=async()=>{while(cursor<pending.length)await ensureImage(pending[cursor++]);};
    const residents=[...(world.npcs||[]).filter(n=>n.character).map(n=>n.character),...streetPeopleProfiles(world.dungeon?.scene.streetscape,hero.manifest,world.dungeon?.id).values()];
    const residentAppearances=[...new Map(residents.map(p=>[`${p.appearance}:${p.headId}:${p.bodyId}`,p])).values()];let residentCursor=0;
    // Prefetch only actors in this scene, at bounded concurrency. Cosmetic
    // failures use the hero fallback and must not prevent visiting a city.
    const residentWorker=async()=>{while(residentCursor<residentAppearances.length){const profile=residentAppearances[residentCursor++];await hero.ensure(hero.appearance(profile,{mounted:false})).catch(()=>null);}};
    await Promise.all([
        ...Array.from({length:Math.min(8,pending.length)},worker),
        ...Array.from({length:Math.min(4,residentAppearances.length)},residentWorker),
        ...[save,...socialActors.map(actor=>actor.profile)].map(async profile=>{
            const result=await hero.ensure(hero.appearance(profile));
            if(result?.fallback)throw new Error('角色外观加载失败');
        }),
    ]);
    return [...images];
}
