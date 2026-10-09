import {fetchJson} from './runtime_data.js';
let pending;
export function loadHaqiAtlas(){
    return pending||(pending=fetchJson('data/adventure/world-map-art.json').catch(error=>{pending=null;throw error;}));
}
