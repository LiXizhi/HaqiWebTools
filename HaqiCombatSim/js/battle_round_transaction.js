import {captureBattlePresentation} from './view_battle_presentation.js';
import {recordTacticsRound} from './battle_tactics_journal_core.js';

// A failed checkpoint must not leave a mutated (possibly finished) battle behind
// the previous hand. Replaying the last checkpoint also restores the RNG stream.
export function resolveRecordedBattleRound({save,battle,resolve,record,restore}) {
    const checkpoint=structuredClone(save.pendingEncounter),revision=save.revision;
    try {
        const playback=captureBattlePresentation(battle,resolve);
        record();
        recordTacticsRound(save.pendingEncounter,battle,playback);
        return {battle,playback,error:null};
    } catch(error) {
        save.pendingEncounter=checkpoint;save.revision=revision;
        return {battle:restore(checkpoint),playback:null,error};
    }
}
