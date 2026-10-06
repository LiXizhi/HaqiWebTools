import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAdventure} from '../js/adventure_core.js';
import {petAppearanceStage,petXpLevel,petMaxHp} from '../js/adventure_pets_core.js';
import {preparePromoPets} from '../js/promo_pet_roster_core.js';
const read=file=>JSON.parse(fs.readFileSync(new URL('../data/adventure/'+file,import.meta.url),'utf8'));
test('宠物宣传镜头有五种伙伴、完整四席及四个真实成长阶段',()=>{
    const content=read('chapter.json');content.pets=read('pets.json').pets;
    const save=createAdventure(content,{seed:530}),pets=preparePromoPets(save,content);
    assert.equal(pets.length,5);assert.equal(new Set(pets.map(p=>p.speciesId)).size,5);
    assert.equal(save.formation.length,4);assert.equal(new Set(save.formation).size,4);
    assert.deepEqual([...new Set(pets.map(p=>petAppearanceStage(p,content)))].sort(),[0,1,2,3]);
    for(const pet of pets){assert.equal(pet.level,petXpLevel(pet.xp,content));assert.equal(pet.hp,petMaxHp(pet,content));assert.ok(pet.deck.length);assert.ok(content.pets[pet.speciesId].art);}
});
