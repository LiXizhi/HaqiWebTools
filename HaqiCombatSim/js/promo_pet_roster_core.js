import {addPet,petParams} from './adventure_pets_core.js';

// Disposable trailer collection. Growth uses the same XP thresholds as the game.
export function preparePromoPets(save,content){
    const step=petParams(content).petXpStep;
    for(const [id,level] of [['flame_puppy_doudou',10],['mimi_frost_seal',25],['pixel_penguin_icebean',40],['dragon_purple',15]]){
        addPet(save,content,id,level*(level-1)/2*step);
    }
    const ids=Object.keys(save.pets);
    save.heroSlot=0;save.formation=ids.slice(0,4);
    return ids.map(id=>save.pets[id]);
}
