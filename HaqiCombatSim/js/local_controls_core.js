export const LOCAL_ACTIONS={up:'向上',down:'向下',left:'向左',right:'向右',confirm:'交互／确认',back:'返回',inventory:'背包',pet:'宠物',deck:'卡包',follow:'跟随',gathering:'采集背包',discard:'弃牌',pass:'跳过'};
export const DEFAULT_LOCAL_KEYS=[
    {up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD',confirm:'KeyE',back:'KeyQ',inventory:'KeyB',pet:'KeyP',deck:'KeyC',follow:'KeyF',gathering:'KeyG',discard:'KeyX',pass:'KeyZ'},
    {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',confirm:'Enter',back:'ShiftRight',inventory:'Insert',pet:'Home',deck:'PageUp',follow:'End',gathering:'Backslash',discard:'Delete',pass:'PageDown'},
];
export function normalizeLocalKeys(value){
    if(!Array.isArray(value)||value.length!==2)return structuredClone(DEFAULT_LOCAL_KEYS);
    const all=[];
    for(const row of value)for(const action of Object.keys(LOCAL_ACTIONS)){
        const code=row?.[action];
        if(typeof code!=='string'||!code||code==='Escape'||code.length>30||all.includes(code))return structuredClone(DEFAULT_LOCAL_KEYS);
        all.push(code);
    }
    return value.map(row=>Object.fromEntries(Object.keys(LOCAL_ACTIONS).map(a=>[a,row[a]])));
}
export function changeLocalKey(keys,owner,action,code){
    if(!LOCAL_ACTIONS[action]||![0,1].includes(owner)||!code||code==='Escape')throw Error('这个按键不能使用');
    if(keys.some((row,i)=>Object.entries(row).some(([a,c])=>c===code&&(i!==owner||a!==action))))throw Error('这个按键已被另一项操作使用');
    const next=structuredClone(keys);next[owner][action]=code;return next;
}
export function localKeyAction(keys,code){
    for(let owner=0;owner<2;owner++)for(const [action,key] of Object.entries(keys[owner]))if(key===code)return {owner,action};
    return null;
}
