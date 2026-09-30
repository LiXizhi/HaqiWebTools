import {el} from './view_adventure.js';
import {petPortrait} from './view_adventure_pets.js';
import {selectSocialPetId} from './adventure_companion_core.js';

export function companionPet(p,state,cb,shownSpecies=new Set()){
    if(p?.speciesId)return null;
    const assets=cb.assets?.(),content=assets?.content;if(!content?.pets)return null;
    let speciesId,stage;
    if(p.kind==='self'||p.id==='hero'){
        const follow=state.followPet;
        if(!follow||shownSpecies.has(follow.speciesId))return null;
        speciesId=follow.speciesId;stage=follow.stage;
    }else{
        speciesId=selectSocialPetId({id:p.profileId||p.id,school:p.school,name:p.name},content);stage=2;
    }
    if(!content.pets[speciesId]?.art)return null;
    const badge=el('div','party-seat-pet',petPortrait(assets,speciesId,stage??2,48));
    badge.setAttribute('aria-label',content.pets[speciesId].name||'宠物');return badge;
}
