// Device preferences only. Never attach this object to a character save.
import {EARTH_LIGHT_MODES,EARTH_WEATHER_MODES} from './adventure_earth_environment_core.js';
export const defaultGameSettings = Object.freeze({version:1,environmentVersion:2,particles:'auto',trails:'auto',earthLight:'day',earthWeather:'clear',music:false,sound:true,volume:.3});
export function normalizeGameSettings(value={}) {
    const result={...defaultGameSettings};
    for(const key of ['particles','trails'])if(['auto','on','off'].includes(value[key]))result[key]=value[key];
    if(EARTH_LIGHT_MODES.includes(value.earthLight))result.earthLight=value.earthLight;
    if(EARTH_WEATHER_MODES.includes(value.earthWeather))result.earthWeather=value.earthWeather;
    for(const key of ['music','sound'])if(typeof value[key]==='boolean')result[key]=value[key];
    if(typeof value.volume==='number'&&Number.isFinite(value.volume))result.volume=Math.max(0,Math.min(1,value.volume));
    return result;
}
export function createAdaptiveGraphics(){
    let reduced=false,last=null,start=null,frames=0,slow=0,grace=0,scope=null;
    function suspend(now){last=null;start=null;frames=0;slow=0;grace=now+3000;}
    return {
        suspend,
        reset(now=0){reduced=false;suspend(now);},
        sample(now,{active=true,scene=null}={}){
            if(!active||scope!==scene){scope=scene;suspend(now);return;}
            if(reduced||now<grace)return;
            if(last===null){last=now;start=now;return;}
            last=now;frames++;
            if(now-start>=5000){slow=frames*1000/(now-start)<40?slow+1:0;start=now;frames=0;if(slow>=2)reduced=true;}
        },
        get reduced(){return reduced;},
        effects(settings){return {...Object.fromEntries(['particles','trails'].map(key=>[key,settings[key]==='on'||settings[key]==='auto'&&!reduced])),earthLight:settings.earthLight||'day',earthWeather:settings.earthWeather||'clear',low:reduced};}
    };
}
