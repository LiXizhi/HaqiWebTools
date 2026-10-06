import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {installIslandEncounters} from '../js/adventure_island_encounters_core.js';
import {installModelPets, monsterCaptureSpecies, stampBattleMonsters} from '../js/adventure_monster_pets_core.js';
import * as A from '../js/adventure_core.js';
import * as P from '../js/adventure_pets_core.js';
import {createPveBattle, playPveRound} from '../js/combat_pve_core.js';
import {validTargets} from '../js/combat_arena_core.js';
import {selectSocialPetId} from '../js/adventure_companion_core.js';
import {breedPets, createPetInstance} from '../js/adventure_pet_interactions_core.js';

const read = path => JSON.parse(fs.readFileSync(new URL('../data/' + path, import.meta.url)));
const art = read('adventure/monster-art.json');
const {content, dataset} = installExpansion(
    read('adventure/chapter.json'), read('adventure/combat.json'), read('adventure/pets.json'),
    read('adventure/shop-candidates.json'), read('kids/cards.json'), read('kids/charms.json'),
);
const shopBefore = content.shop.length;
installIslandEncounters(content, dataset, read('adventure/island-encounters.json'), read('kids/cards.json'));
content.monsterArt = art;
installModelPets(content, art, dataset.cards);

test('original webp monsters become fixed pets and atlas monsters stay catalog pets', () => {
    assert.equal(content.shop.length, shopBefore);
    assert.equal(Object.values(content.pets).filter(pet => !pet.legacy && !pet.staticAppearance).length, 359);
    const portrait = Object.values(content.monsters).find(monster => monsterCaptureSpecies(monster, art)?.static);
    const atlas = content.monsters['fire-scout'];
    const modelId = monsterCaptureSpecies(portrait, art).id;
    assert.equal(content.pets[modelId].staticAppearance, true);
    assert.equal(content.pets[modelId].art.static, true);
    assert.equal(content.pets[modelId].name, portrait.name);
    const stamped = stampBattleMonsters([portrait, atlas], content, dataset);
    assert.equal(stamped[0].speciesId, modelId);
    assert.equal(stamped[1].speciesId, 'flame_puppy_doudou');
    assert.equal(portrait.speciesId, undefined);
    assert.equal(content.pets.flame_puppy_doudou.staticAppearance, undefined);
    const shared = Object.values(content.monsters).filter(monster => monsterCaptureSpecies(monster, art)?.portraitId === monsterCaptureSpecies(portrait, art).portraitId);
    assert.ok(shared.length > 1);
    assert.ok(new Set(shared.map(monster => monsterCaptureSpecies(monster, art).id)).size > 1);
    const save = A.createAdventure(content, {starter: 'dragon_green', seed: 7});
    const pet = P.addPet(save, content, modelId, P.petParams(content).petXpStep * 40 * 39 / 2);
    assert.ok(pet.level >= 40);
    assert.equal(P.petAppearanceStage(pet, content), 0);
    assert.equal(P.petAppearanceStage({speciesId: 'flame_puppy_doudou', level: 40}, content), 3);
    assert.throws(() => P.petAction(save, content, {type: 'pet-appearance', petId: modelId, stage: 1}), /不随等级变化/);
    for (let i = 0; i < 40; i++) assert.equal(content.pets[selectSocialPetId({id: 'resident-' + i, school: 'fire'}, content)].staticAppearance, undefined);
});

test('both art sources can be captured with a catch rune', () => {
    const save = A.createAdventure(content, {starter: 'dragon_green', seed: 9});
    const portrait = Object.values(content.monsters).find(monster => monster.name === '火鸟战士' && monsterCaptureSpecies(monster, art)?.static);
    const monsters = stampBattleMonsters([portrait, content.monsters['fire-scout']], content, dataset);
    const battle = createPveBattle({
        dataset, player: A.playerSpec(save, content), monsters, seed: 3,
        captureStock: 2, heroLevel: 50, adventureParams: {...P.petParams(content), captureBase: 1, captureWounded: 0},
    });
    const hero = battle.sides.near[0];
    assert.deepEqual(validTargets(battle, hero, {type: 'CatchPet'}).map(unit => unit.template.speciesId), [monsters[0].speciesId, 'flame_puppy_doudou']);
    playPveRound(battle, {capture: true, targetId: 'mob0'});
    playPveRound(battle, {capture: true, targetId: 'mob1'});
    assert.deepEqual(battle.captured, [monsters[0].speciesId, 'flame_puppy_doudou']);
    P.addPet(save, content, battle.captured[0]);
    P.addPet(save, content, battle.captured[1]);
    assert.equal(save.pets[monsters[0].speciesId].speciesId, monsters[0].speciesId);
    assert.equal(content.pets[save.pets.flame_puppy_doudou.speciesId].art.rows, 4);
    const onlyModels = {...content, pets: Object.fromEntries(Object.entries(content.pets).map(([id, pet]) => [id, pet.staticAppearance ? pet : {...pet, legacy: true}]))};
    const xp = 30 * 25 * 24 / 2;
    const mom = createPetInstance(content, {id: 'mom', speciesId: 'dragon_green', ownerId: 'owner:mom', gender: 'female', xp});
    const dad = createPetInstance(content, {id: 'dad', speciesId: 'dragon_orange', ownerId: 'owner:dad', gender: 'male', xp});
    mom.memoryClock = dad.memoryClock = 1;
    mom.memories = [{otherId: 'dad', ownerId: 'owner:dad', level: 25, lastAt: 1, epoch: 'pair', total: 3, available: 3, lastMarkDay: 0}];
    dad.memories = [{otherId: 'mom', ownerId: 'owner:mom', level: 25, lastAt: 1, epoch: 'pair', total: 3, available: 3, lastMarkDay: 0}];
    assert.throws(() => breedPets(mom, dad, {now: 1, scene: {zone: 'camp', distance: 20, anchor: {x: 1, y: 1}, walkable: true}, babyId: 'baby-1'}, onlyModels), /没有可用宝宝/);
});


test('every shipped island and dungeon monster resolves to a collectible pet',()=>{
    const all={...content,monsters:{...content.monsters,...read('adventure/dungeons.json').monsters},pets:{...content.pets}};
    const monsters=Object.values(all.monsters);
    const stamped=stampBattleMonsters(monsters,all,{cards:read('kids/cards.json')});
    assert.ok(stamped.length>400);
    for(const m of stamped)assert.ok(all.pets[m.speciesId],m.name+' '+m.id);
});
