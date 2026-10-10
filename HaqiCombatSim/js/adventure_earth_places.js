import {createLocalStore} from './adventure_local_store.js';

// Device-local map preferences, deliberately separate from role/cloud saves.
export function createEarthPlaces({store=createLocalStore({name:'haqi-earth-places-v1'})}={}){
    const key='places';
    const point=value=>{
        if(!value||!Number.isFinite(value.lon)||!Number.isFinite(value.lat)||Math.abs(value.lon)>180||Math.abs(value.lat)>90)throw Error('收藏地点坐标无效');
        return {id:String(value.id||''),name:String(value.name||'收藏地点').slice(0,100),lon:value.lon,lat:value.lat};
    };
    const normalize=value=>({recent:value?.recent||null,favorites:Array.isArray(value?.favorites)?value.favorites:[]});
    return {
        async read(){return normalize(await store.read(key));},
        visit(city){const recent=point(city);return store.update(key,value=>({...normalize(value),recent}));},
        add(geo){const favorite={...point(geo),id:`favorite:${geo.lon.toFixed(6)},${geo.lat.toFixed(6)}`,favorite:true};return store.update(key,value=>{
            const state=normalize(value);return {...state,favorites:[...state.favorites.filter(p=>p.id!==favorite.id),favorite]};
        });},
        remove(id){return store.update(key,value=>{const state=normalize(value);return {...state,favorites:state.favorites.filter(p=>p.id!==id)};});},
    };
}
