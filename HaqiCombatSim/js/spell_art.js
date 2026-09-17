import {loadSkillArt} from './skill_art.js';
// The same atlas cache serves card faces and combat animation subjects.
export async function loadSpellArt(assets) {
    if (!assets.skillArt) assets.skillArt = await loadSkillArt(assets.effects, assets.mode);
    assets.spellArt = assets.skillArt.manifest.bases;
    assets.ensureSpellArt = base => assets.skillArt.ensure(base);
}
