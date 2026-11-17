// City dungeon world creation and read-only progress helpers. No browser IO.
import { resolveParams } from './combat_params_core.js';
import { safeStreetPosition } from './adventure_city_street_core.js';

export function dungeonFor(content, id) {
    return content.dungeons?.find(d => d.id === id);
}

export function dungeonProgress(save) {
    return save?.coopRun?.runs || save?.dungeonRuns || {};
}

export const cityDungeonState = (save, cityId, id) =>
    save.earthCityProgress?.cities?.[cityId]?.dungeons?.[id] || { version: 1, done: [], items: {}, cleared: [] };

export function cityBattleReady(save, dungeon, encounterId) {
    const encounter = dungeon.scene.encounters.find(row => row.id === encounterId);
    const state = cityDungeonState(save, dungeon.cityId, dungeon.id);
    return !!encounter && !state.cleared.includes(encounterId) && (encounter.requires || []).every(id => state.done.includes(id));
}

export function createCityDungeonWorld(content, save, dungeon) {
    const layout = content.worldMaps[dungeon.id], city = content.earthCities[dungeon.cityId], scene = dungeon.scene;
    const params = resolveParams({ version: 'kids' }, content.balanceParams || {});
    const npcs = scene.npcs.map(row => ({
        ...city.npcs.find(n => n.id === row.id),
        ...row,
        zone: dungeon.id,
        cityId: city.id,
        cityDungeonNpc: true,
        cityHotspot: scene.hotspots.find(h => h.npcId === row.id)?.id,
        hidden: false,
    }));
    const state = cityDungeonState(save, city.id, dungeon.id);
    if (scene.streetscape && save.zone === dungeon.id) save.position = safeStreetPosition(scene, save.position);
    save.dungeonRuns ??= {};
    save.dungeonRuns[dungeon.id] = { cleared: [...state.cleared] };
    return {
        zone: dungeon.id,
        isDungeon: true,
        isCityDungeon: true,
        city,
        dungeon,
        w: layout.w,
        h: layout.h,
        layout,
        center: layout.spawn,
        interactionParams: params.adventure,
        monsterSceneParams: params.monsterScene,
        npcs,
        encounters: content.encounters
            .filter(e => e.zone === dungeon.id && cityBattleReady(save, dungeon, e.id))
            .map(e => ({ ...e })),
        landmarks: layout.landmarks.map(mark => ({
            ...mark,
            cityDone:
                scene.actions.some(a => a.hotspot === mark.cityHotspot) &&
                scene.actions.filter(a => a.hotspot === mark.cityHotspot).every(a => state.done.includes(a.id)),
        })),
        buildings: scene.buildings || [],
        paths: [],
        trees: [],
        decorations: [],
        portal: {
            id: 'portal',
            ...layout.portal,
            name: dungeon.nodeId ? '返回来时地点' : '返回现实世界',
            hidden: false,
        },
    };
}
