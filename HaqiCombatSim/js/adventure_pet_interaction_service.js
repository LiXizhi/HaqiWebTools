// Application-facing transaction boundary. It operates only on explicitly loaded
// scene pets; callers inject verified dialogue/arrival events and a walkable anchor.
import {interactPets,breedPets,adoptPet,prunePetMemories} from './adventure_pet_interactions_core.js';

export function createPetInteractionService({repository,content,newId=()=>globalThis.crypto.randomUUID()}){
    let running=false;
    async function exclusive(fn){
        if(running)throw Error('宠物正在互动，请稍候');running=true;
        try{return await fn();}finally{running=false;}
    }
    return {
        get busy(){return running;},
        // event.kind is owner-dialogue/manual-feed/proximity, not a free-form grant.
        interact({pairs,event}){return exclusive(async()=>{
            if(!Array.isArray(pairs)||!pairs.length)return {effects:[],babies:[]};
            const seen=new Set(),ordered=[];
            for(const pair of pairs){
                if(!Array.isArray(pair.ids)||pair.ids.length!==2||pair.ids[0]===pair.ids[1])throw Error('宠物配对无效');
                const key=JSON.stringify([...pair.ids].sort());if(seen.has(key))continue;seen.add(key);ordered.push(pair);
            }
            // Caller places the current interaction first. Remaining pairs are stable.
            const [first,...others]=ordered;others.sort((a,b)=>{const left=JSON.stringify([...a.ids].sort()),right=JSON.stringify([...b.ids].sort());return left<right?-1:left>right?1:0;});
            const source=await repository.getMany(ordered.flatMap(pair=>pair.ids));
            if(source.some(row=>!row))throw Error('宠物尚未加载或已不在场景');
            const rows=new Map(source.map(row=>[row.pet.id,row])),staged=new Map(source.map(row=>[row.pet.id,row.pet]));
            const effects=[],babies=[];
            for(const pair of [first,...others]){
                let a=staged.get(pair.ids[0]),b=staged.get(pair.ids[1]);
                const interaction=interactPets(a,b,{...event,scene:pair.scene},content);
                [a,b]=interaction.pets;
                // A proximity event can give birth after cooldown, but never grants a mark.
                const born=breedPets(a,b,{now:event.now,scene:pair.scene,babyId:newId()},content);
                [a,b]=born.pets;staged.set(a.id,a);staged.set(b.id,b);
                if(born.baby)babies.push(born.baby);
                effects.push({ids:pair.ids,play:interaction.play,markAdded:interaction.markAdded,status:born.status,babyId:born.baby?.id??null});
            }
            const changes=[...staged.values()].map(pet=>({pet,expectedPath:rows.get(pet.id).path}));
            changes.push(...babies.map(pet=>({pet,expectedPath:null})));
            await repository.commit(changes);
            return {effects,babies};
        });},
        adopt(id,options){return exclusive(async()=>{
            const row=await repository.get(id);if(!row)throw Error('找不到这只宝宝');
            const result=adoptPet(row.pet,options,content);
            if(result.adopted)await repository.commit([{pet:result.pet,expectedPath:row.path}]);
            return result;
        });},
        prune(ids,now){return exclusive(async()=>{
            const rows=await repository.getMany(ids);
            if(rows.some(row=>!row))throw Error('宠物文件尚未加载');
            if(!rows.length)return {changed:false};
            return repository.commit(rows.map(row=>({pet:prunePetMemories(row.pet,now,content),expectedPath:row.path})));
        });},
    };
}
