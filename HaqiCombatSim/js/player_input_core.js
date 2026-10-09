// Device assignment and standard Gamepad mapping; no browser dependencies.
export const DEFAULT_PLAYER_INPUTS=[{type:'keyboard-left'},{type:'keyboard-right'}];
export function inputConflict(a,b){
    if(a.type==='none'||b.type==='none')return false;
    if(a.type==='gamepad'||b.type==='gamepad')return a.type===b.type&&a.index===b.index;
    return a.type===b.type||a.type==='keyboard-mouse'||b.type==='keyboard-mouse';
}
export function normalizePlayerInputs(value){
    if(!Array.isArray(value)||value.length!==2)return structuredClone(DEFAULT_PLAYER_INPUTS);
    const rows=value.map((r,i)=>['none','keyboard-left','keyboard-right','keyboard-mouse'].includes(r?.type)?{type:r.type}:r?.type==='gamepad'&&Number.isInteger(r.index)&&r.index>=0&&r.index<16&&typeof r.id==='string'?{type:'gamepad',index:r.index,id:r.id}:DEFAULT_PLAYER_INPUTS[i]);
    return inputConflict(...rows)?structuredClone(DEFAULT_PLAYER_INPUTS):structuredClone(rows);
}
export function assignPlayerInput(current,owner,device){
    const next=structuredClone(current);next[owner]=device;
    if(inputConflict(...next)){
        next[1-owner]=structuredClone(current[owner]);
        // Full keyboard owns both banks, so swapping a bank cannot free it.
        if(inputConflict(...next))next[1-owner]={type:'none'};
    }
    return normalizePlayerInputs(next);
}
export function assignedKeyboardAction(inputs,keys,code){
    for(let owner=0;owner<2;owner++){
        const type=inputs[owner].type,rows=type==='keyboard-mouse'?keys:type==='keyboard-left'?[keys[0]]:type==='keyboard-right'?[keys[1]]:[];
        for(const row of rows)for(const [action,key] of Object.entries(row))if(key===code)return {owner,action};
    }
    return null;
}
export function standardPadActions(pad){
    if(!pad?.connected||pad.mapping!=='standard')return [];
    const on=i=>!!pad.buttons?.[i]?.pressed||pad.buttons?.[i]?.value>.5;
    const actions=[];
    for(const [action,i] of Object.entries({confirm:0,back:1,discard:2,pet:3,deck:4,pass:5,gathering:6,follow:7,inventory:8,settings:9}))if(on(i))actions.push(action);
    if(on(12)||pad.axes?.[1]<-.3)actions.push('up');if(on(13)||pad.axes?.[1]>.3)actions.push('down');
    if(on(14)||pad.axes?.[0]<-.3)actions.push('left');if(on(15)||pad.axes?.[0]>.3)actions.push('right');
    return actions;
}
export function createPadTransitions(){
    const states=[null,null];
    return {step(owner,device,pad,now,enabled=true){
        const signature=JSON.stringify(device),old=states[owner];
        const valid=enabled&&device.type==='gamepad'&&pad?.index===device.index&&pad.id===device.id&&pad.connected&&pad.mapping==='standard';
        const current=new Set(valid?standardPadActions(pad):[]),events=[];
        if(!old||old.signature!==signature){if(old)for(const action of old.held)events.push({action,down:false});states[owner]={signature,held:new Set(),armed:!current.size,next:{}};return events;}
        for(const action of old.held)if(!current.has(action))events.push({action,down:false});
        if(!valid){states[owner]={signature,held:new Set(),armed:false,next:{}};return events;}
        if(!old.armed){if(!current.size)old.armed=true;return events;}
        for(const action of current){const direction=['up','down','left','right'].includes(action);
            if(!old.held.has(action)){events.push({action,down:true,repeat:false});old.next[action]=now+350;}
            else if(direction&&now>=old.next[action]){events.push({action,down:true,repeat:true});old.next[action]=now+140;}
        }
        old.held=current;return events;
    }};
}
