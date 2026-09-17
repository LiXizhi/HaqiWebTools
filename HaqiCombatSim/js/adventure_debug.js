// Browser persistence for explicit debug edits; backup does not share the cloud restore slot.
import { SAVE_KEY, saveLocal } from './adventure_assets.js';
import { parseSave } from './adventure_core.js';
export const DEBUG_BACKUP_KEY=`${SAVE_KEY}.before-debug`;
export function hasDebugBackup(storage=localStorage){try{return !!storage.getItem(DEBUG_BACKUP_KEY);}catch{return false;}}
export function storeDebugEdit(previous,next,storage=localStorage){
    if(previous.pendingEncounter)throw Error('请先完成当前战斗');
    storage.setItem(DEBUG_BACKUP_KEY,JSON.stringify(previous));
    saveLocal(next,storage);
}
export function restoreDebugBackup(current,content,storage=localStorage){
    if(current.pendingEncounter)throw Error('请先完成当前战斗');
    const raw=storage.getItem(DEBUG_BACKUP_KEY);if(!raw)throw Error('没有可恢复的调试备份');
    const save=parseSave(raw,content);if(save.pendingEncounter)throw Error('备份包含进行中的战斗');
    save.revision=(current.revision||0)+1;saveLocal(save,storage);return save;
}
