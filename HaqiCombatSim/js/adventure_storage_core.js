import {localBuffDay} from './language_daily_buff_core.js';
import {petSummary,petContentKey} from './adventure_pet_files_core.js';
// Persistence projections only; combat rules and live save shape stay unchanged.
import { petMaxHp } from './adventure_pets_core.js';
import { mapInfo } from './adventure_island_layout_core.js';

const copy = value => JSON.parse(JSON.stringify(value));
const localFields = ['heroHp','careAt','careLog','position','facing','pendingEncounter','encounterRespawns','stamina','staminaRefillDay','coopRun','dungeonExploration','dungeonMode','dungeonLanguageBuff'];
// Cosmetic preferences stay on this device only: stripped from durable/cloud saves,
// kept in the role's IndexedDB runtime record and restored regardless of revision.
const prefFields = ['magicStarFollow','mountHidden'];
const itemFields = ['petPages','petFileRefs','petWorld','pets','equipmentInstances','nextEquipmentGuid','upgrades','cards','pet'];
const battleFields = ['inventory','petFoodSlots','equipment','equipmentGuids','mountId','formation','heroSlot','deck'];
const recordFields = ['transactions','rewardedEncounters','fishingRecords','learnerMemory','socialActivity','socialPvpRecords','socialChallenges','relationshipEvents'];
export const storageParts = ['items','battle','records','towers'];

export function stableJson(value) {
    return JSON.stringify(value, (_, row) => row && typeof row === 'object' && !Array.isArray(row)
        ? Object.fromEntries(Object.keys(row).sort().map(key => [key,row[key]])) : row);
}
export function durableSave(save) {
    const result = copy(save);
    if(result.towerRecords&&Object.keys(result.towerRecords).length===0)delete result.towerRecords;
    // A cloud-only restore returns to the island; the full cooperative run stays on this device.
    if(save.coopRun){result.zone=save.coopRun.returnTo.zone;result.dungeonReturn=null;}
    delete result.dailyLanguageBuff;
    for(const key of ['music','gameSettings','graphicsSettings'])delete result[key];
    for (const key of localFields) delete result[key];
    for (const key of prefFields) delete result[key];
    if(result.checkin?.version===2)delete result.checkin.onlineMs;
    for (const pet of Object.values(result.pets || {})) { delete pet.hp;delete pet.hunger; }
    delete result.petMeetings;
    return result;
}
export function runtimeValues(save) {
    return { dailyLanguageBuff:save.dailyLanguageBuff?copy(save.dailyLanguageBuff):null, zone:save.coopRun?.returnTo.zone||save.zone, revision:save.revision, coopZone:save.coopRun?save.zone:null, coopReturn:save.coopRun?copy(save.dungeonReturn):null, checkinOnline:save.checkin?.version===2?{day:save.checkin.day,onlineMs:save.checkin.onlineMs}:null, values:Object.fromEntries(localFields.filter(key => save[key] !== undefined).map(key => [key,copy(save[key])])),
        prefs:Object.fromEntries(prefFields.filter(key => save[key] !== undefined).map(key => [key,copy(save[key])])),
        pets:Object.fromEntries(Object.entries(save.pets || {}).map(([id,pet]) => [id,{id:pet.id,hp:pet.hp,hunger:pet.hunger}])) };
}
export function restoreRuntime(save, content, runtime) {
    const result = copy(save);
    const matching = runtime?.zone === save.zone && runtime.revision === save.revision;
    result.position = {...mapInfo(save.zone,content).initialSpawn};
    result.facing = 3;result.pendingEncounter = null;
    for (const key of prefFields) { const value = runtime?.prefs?.[key]; if (value !== undefined) result[key] = copy(value); }
    delete result.petMeetings; // Legacy device meetings are deliberately discarded.
    if (result.pets) {result.heroHp = null;result.careAt = 0;result.careLog = [];}
    if (matching) Object.assign(result,copy(runtime.values));
    delete result.dailyLanguageBuff;

    if(runtime?.dailyLanguageBuff?.day===localBuffDay())result.dailyLanguageBuff=copy(runtime.dailyLanguageBuff);
    if(matching&&result.coopRun&&runtime.coopZone){result.zone=runtime.coopZone;result.dungeonReturn=copy(runtime.coopReturn);}
    if(result.checkin?.version===2)result.checkin.onlineMs=matching&&runtime.checkinOnline?.day===result.checkin.day?runtime.checkinOnline.onlineMs:0;
    // Missing/evicted local records mean full health and hunger. No server reads.
    for (const [id,pet] of Object.entries(result.pets || {})) {
        const row = matching && runtime.pets?.[id]?.id === pet.id ? runtime.pets[id] : null;
        const max = petMaxHp(pet,content);
        pet.hp = Number.isFinite(row?.hp) ? Math.max(0,Math.min(max,row.hp)) : max;
        pet.hunger = Number.isFinite(row?.hunger) ? Math.max(0,Math.min(100,row.hunger)) : 100;
    }
    return result;
}
export function coreCatalogKey(catalog) {
    return stableJson({...catalog,roles:catalog.roles.map(row => {
        const save = durableSave(row.save);delete save.revision;
        if(save.petInstanceVersion===1){const refs={...save.petFileRefs};for(const group of ['pets','petWorld'])for(const [id,p]of Object.entries(save[group]||{}))refs[id]={group,summary:petSummary(p),contentKey:petContentKey(p)};save.petFileRefs=Object.fromEntries(Object.entries(refs).map(([id,r])=>[id,{group:r.group,summary:r.summary,contentKey:r.contentKey}]));delete save.petPages;delete save.pets;delete save.petWorld;}
        return {id:row.id,save};
    })});
}
export function splitRoleSave(save) {
    const state = durableSave(save), parts = {items:{},battle:{},records:{},towers:{}};
    for (const [part,keys] of [['items',itemFields],['battle',battleFields],['records',recordFields],['towers',['towerRecords']]]) {
        for (const key of keys) if (Object.hasOwn(state,key)) {parts[part][key] = state[key];delete state[key];}
    }
    parts.items.ownedItemIds = Object.keys(parts.battle.inventory || {}).sort((a,b)=>Number(a)-Number(b));
    // Small combat bag contains copies of equipped instances and at most four pets.
    const selected = new Set(Object.values(parts.battle.equipmentGuids || {}));
    parts.battle.equippedItems = copy((parts.items.equipmentInstances || []).filter(row => selected.has(row.guid)));
    parts.battle.activePets = copy(Object.fromEntries((parts.battle.formation || []).filter(Boolean).map(id => [id,parts.items.pets?.[id]||save.pets?.[id]])));
    parts.battle.mount = parts.battle.mountId == null ? null : {itemId:parts.battle.mountId,count:parts.battle.inventory?.[parts.battle.mountId] || 0};
    return {state,...parts};
}
export function joinRoleSave(state, parts, content, { strict = true } = {}) {
    const battle = {...parts.battle};delete battle.activePets;delete battle.equippedItems;delete battle.mount;
    const items={...parts.items};delete items.ownedItemIds;
    // Witness fields (ownedItemIds, combat bag copies) guard against mixed-revision parts.
    // strict:false only merges primary fields, for cloud saves written by older storage formats.
    if(strict&&stableJson(Object.keys(battle.inventory||{}).sort((a,b)=>Number(a)-Number(b)))!==stableJson(parts.items.ownedItemIds))throw Error('物品数量账本与收藏不一致');
    const save = {...state,...items,...battle,...parts.records,...parts.towers};
    if (strict && stableJson(splitRoleSave(save).battle) !== stableJson(parts.battle)) throw Error('战斗背包与物品收藏不一致');
    return restoreRuntime(save,content);
}
