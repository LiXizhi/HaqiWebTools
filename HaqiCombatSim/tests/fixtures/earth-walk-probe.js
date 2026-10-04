import {movePosition} from '../../js/adventure_world_core.js';
import {terrainKey,earthGeo} from '../../js/adventure_earth_core.js';
import {performanceDiagnostics as perf} from '../../js/performance_diagnostics.js';

// Actual collision-aware walking, never position jumps. A stopped route cannot pass.
export function createEarthWalkProbe(world,position,{seconds=180,span=6000}={}){
    const origin={...position},started=performance.now(),frames=[],draws=[],samples=[];let sign=1,distance=0,crossings=0,terrainCrossings=0,lastChunk='',lastTerrain='',turns=0,heading=0,detour=0;
    function direction(p,dt){
        if(sign>0&&p.x>origin.x+span||sign<0&&p.x<origin.x-span){sign=-sign;turns++;}
        const preferred=sign>0?0:Math.PI;
        const clear=a=>{const next=movePosition(world,p,Math.cos(a)*45,Math.sin(a)*45);return Math.hypot(next.x-p.x,next.y-p.y)>44;};
        if(detour<=0||!clear(heading)){
            const offsets=[0,.3926990817,-.3926990817,.7853981634,-.7853981634,1.1780972451,-1.1780972451,Math.PI/2,-Math.PI/2,Math.PI];
            heading=offsets.map(a=>preferred+a).find(clear)??preferred;detour=heading===preferred?0:80;
        }
        detour-=210*dt;return {x:Math.cos(heading),y:Math.sin(heading)};
    }
    function moved(previous,next,time){
        distance+=Math.hypot(next.x-previous.x,next.y-previous.y);
        const key=`${Math.floor(next.x/world.earthRules.chunkSize)}:${Math.floor(next.y/world.earthRules.chunkSize)}`;
        if(lastChunk&&key!==lastChunk){crossings++;perf.event('earth-walk-crossing',{key});}lastChunk=key;
        const geo=earthGeo(next,world.earthRules),terrain=terrainKey(geo.lon,geo.lat);if(lastTerrain&&lastTerrain!==terrain)terrainCrossings++;lastTerrain=terrain;
        if(!samples.length||time-samples.at(-1).time>10000)samples.push({time,position:{...next},distance,crossings,surface:world.surfaceStats,cache:world.streamCacheStats,heap:performance.memory?.usedJSHeapSize});
    }
    return {started,seconds,frames,draws,direction,moved,done:time=>time-started>=seconds*1000,result(position){return {seconds,travelled:distance,displacement:Math.hypot(position.x-origin.x,position.y-origin.y),crossings,terrainCrossings,turns,samples,diagnostics:perf.summary(),timeline:perf.timeline(),surface:world.surfaceStats,sceneCache:world.streamCacheStats,position:{...position},valid:distance>=seconds*120&&crossings>=Math.min(20,Math.floor(seconds/6))};}};
}
