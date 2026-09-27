// Pure atlas selection for the current island. Startup must not load other zones.
const BUILDING_ZONES=new Set(['town','fire','ice','desert','dark']);
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
    const zone=world.zone==='camp'?'town':world.zone;
    if(BUILDING_ZONES.has(zone))building.push(zone);
    if(world.trees?.some(tree=>tree.snow))environment.push('trees');
    const kinds=new Set();
    for(const region of world.layout.regions||[]){
        const weather=region.weather||world.layout.rules?.biomes?.[region.biome]?.weather;
        if(weather?.kind)kinds.add(weather.kind);
        for(const atlas of BIOME_TERRAIN[region.biome]||['meadow'])terrain.add(atlas);
    }
    if([...kinds].some(kind=>WEATHER_ATLAS.has(kind)))environment.push('weather');
    if(world.layout.coast?.length)terrain.add('shore');
    return {building,environment,terrain:[...terrain]};
}
