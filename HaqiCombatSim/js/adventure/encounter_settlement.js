import { settleEncounter } from '../adventure_core.js';
import { ownedPetRecords } from '../adventure_pet_files_core.js';
import { rewardSnapshot } from '../adventure_reward_feedback_core.js';

// Loading captured pets and recording language progress can outlive this character's battle.
export async function settleFinishedEncounter({ save, battle, content, loadPet, completeLanguageTask, isCurrent }) {
    const pending = save.pendingEncounter;
    if (!pending || !battle.finished) return null;
    const stillPending = () => isCurrent() && save.pendingEncounter === pending;
    const captured = new Set(battle.captured || []);
    const missing = Object.values(ownedPetRecords(save)).filter(pet => captured.has(pet.speciesId) && !save.pets?.[pet.id]);
    await Promise.all(missing.map(pet => loadPet(pet.id)));
    if (!stillPending()) return null;

    const before = rewardSnapshot(save);
    if (battle.winner === 'near' && pending.languageTask) {
        await completeLanguageTask(pending.languageTask);
        if (!stillPending()) return null;
    }
    const settle = settleEncounter(save, content, battle, { now: Date.now() });
    return { before, settle, encounterId: pending.encounterId };
}
