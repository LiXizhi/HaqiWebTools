// Versioned cloud envelopes. No SDK, storage, clock or network in chapter rules.
import { createAdventure, parseSave } from './adventure_core.js';
import { restorePveBattle } from './combat_pve_core.js';

export const CLOUD_VERSION = 1;
const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
export function checkedProgress(raw, content, dataset) {
    if (typeof raw === 'string') requireValue(raw.length <= 1024 * 1024, '存档文件过大');
    const parsed = parseSave(raw, content);
    // Only the game's known fields travel to the cloud; SDK state never enters a save.
    // These optional fields are validated by parseSave but do not exist until
    // the first online tick/claim. Keep them across role reloads and cloud sync.
    const keys=[...Object.keys(createAdventure(content)),'magicStarClaims','checkin'];
    const save = Object.fromEntries(keys.filter(key=>parsed[key]!==undefined).map(key => [key, parsed[key]]));
    const battle = save.pendingEncounter ? restorePveBattle(dataset, content, save.pendingEncounter) : null;
    return { save, battle };
}
export function makeCloudSnapshot(save, content, dataset, updatedAt, id) {
    requireValue(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(updatedAt) && Number.isFinite(Date.parse(updatedAt)), '云端时间无效');
    requireValue(/^[a-f0-9-]{16,64}$/.test(id), '云端记录编号无效');
    return { schemaVersion: CLOUD_VERSION, app: 'HaqiAdventure', id, updatedAt, save: checkedProgress(save, content, dataset).save };
}
export function parseCloudSnapshot(raw, content, dataset) {
    requireValue(typeof raw === 'string' && raw.length <= 1024 * 1024, '云端记录无法读取或文件过大');
    const value = JSON.parse(raw);
    requireValue(value?.schemaVersion === CLOUD_VERSION && value.app === 'HaqiAdventure', '云端记录版本不兼容');
    const snapshot = makeCloudSnapshot(value.save, content, dataset, value.updatedAt, value.id);
    return { snapshot, ...checkedProgress(snapshot.save, content, dataset) };
}
export function snapshotPath(snapshot) {
    return `checkpoints/${snapshot.updatedAt.replace(/[-:.]/g, '')}_${snapshot.id}.json`;
}
export function checkpointPaths(listing) {
    return [...new Set(String(listing).split('\n').map(x => x.trim()).filter(x => /^\d{8}T\d{9}Z_[a-f0-9-]{16,64}\.json$/.test(x)))].sort().reverse().slice(0, 30).map(x => `checkpoints/${x}`);
}
