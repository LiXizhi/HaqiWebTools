import {createPadTransitions,normalizePlayerInputs} from './player_input_core.js';
export function connectedPads(){try{return Array.from(navigator.getGamepads?.()||[]).filter(p=>p?.connected);}catch{return [];}}
export function createPlayerInput({settings,dispatch,enabled}){
    const transitions=createPadTransitions();
    return {poll(now){const assignments=normalizePlayerInputs(settings().playerInputs),pads=connectedPads();
        assignments.forEach((device,owner)=>{for(const event of transitions.step(owner,device,pads.find(p=>p.index===device.index),now,enabled(owner)))dispatch(owner,event);});
    }};
}
