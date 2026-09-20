import {applyAction} from './adventure_core.js';
import {saveLocal} from './adventure_assets.js';

// Stage grants separately: storage failures (including a stale browser tab)
// must not award currency or consume a claim in the live character.
export function persistReward(save,content,action,access,storage){
    if(!storage)throw Error('尚未选择角色，无法保存领取记录。');
    const next=structuredClone(save);
    const result=applyAction(next,content,action,access);
    saveLocal(next,storage);
    return {save:next,result};
}
