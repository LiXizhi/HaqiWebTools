// Pure atlas selection for the current island. Startup must not load other zones.
import {sceneArtAtlases} from './island_scene_art_core.js';
const BUILDING_ZONES=new Set(['camp','town','fire','ice','desert','dark']);
const CLASSIC_ISLANDS=new Set(['town','fire','ice','desert','dark']);
const WEATHER_ATLAS=new Set(['embers','mist','ash']);
const BIOME_TERRAIN={
    grass:['meadow'],town:['meadow'],park:['meadow'],farm:['meadow'],lake:['meadow'],oasis:['meadow'],
    forest:['meadow','stones'],beach:['shore'],marsh:['shore'],
    desert:['stones'],gold:['stones'],snow:['stones'],ice:['stones'],volcanic:['stones'],ash:['stones'],
    dark:['stones','meadow'],
};

export function sceneryAtlases(world){
    const building=[],environment=[],terrain=new Set();
    if(!world?.layout)return {building,environment,terrain:[]};
    const zone=world.zone;
    if(BUILDING_ZONES.has(zone))building.push(zone);
    if(zone==='camp'&&!building.includes('town'))building.push('town');
    for(const row of world.buildings||[])if(row.atlas&&!building.includes(row.atlas))building.push(row.atlas);
    if(world.isCityDungeon&&world.dungeon?.scene.generated)building.push('town');
    if(world.trees?.some(tree=>tree.snow))environment.push('trees');
    if((zone==='camp'||zone==='town')&&world.trees?.some(tree=>!tree.snow))environment.push('campTrees');
    if(CLASSIC_ISLANDS.has(zone)&&world.trees?.some(tree=>!tree.snow))environment.push('islandTrees');
    if(zone==='town')environment.push('islandLandmarks');
    const kinds=new Set();
    for(const region of world.layout.regions||[]){
        const weather=region.weather||world.layout.rules?.biomes?.[region.biome]?.weather;
        if(weather?.kind)kinds.add(weather.kind);
        for(const atlas of BIOME_TERRAIN[region.biome]||['meadow'])terrain.add(atlas);
    }
    if([...kinds].some(kind=>WEATHER_ATLAS.has(kind)))environment.push('weather');
    if(world.layout.coast?.length)terrain.add('shore');
    if(zone==='camp'&&world.layout.rules?.terrain?.campRefined){terrain.add('campProps');terrain.add('camp');}
    if(CLASSIC_ISLANDS.has(zone)&&world.layout.w){
        terrain.add('islandPlazasProps');terrain.add('islandLandmarks');
        if(zone==='town')terrain.add('campProps');
    }
    for(const atlas of sceneArtAtlases(world))terrain.add(atlas);
    if(zone==='ice'&&world.trees?.length&&!environment.includes('trees'))environment.push('trees');
    return {building,environment,terrain:[...terrain]};
}
