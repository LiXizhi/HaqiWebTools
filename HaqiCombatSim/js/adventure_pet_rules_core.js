// Shared pure pet progression & deck validation helpers. No browser IO.
import { resolveParams } from './combat_params_core.js';

const check = (ok, message) => {
    if (!ok) throw Error(message);
};

export const petParams = content =>
    resolveParams({ cards: {} }, content.balanceParams || { version: 'kids' }, { groups: ['adventure'] }).adventure;

export function petStage(level, content) {
    return petParams(content).stageLevels.filter(n => level >= n).length - 1;
}

export function petCapacity(pet, content) {
    return petParams(content).petCapacities[petStage(pet.level, content)];
}

export function petXpLevel(xp, content) {
    const p = petParams(content);
    return Math.min(p.levelCap, Math.floor((1 + Math.sqrt(1 + (8 * xp) / p.petXpStep)) / 2));
}

export function petLessons(pet, content) {
    return content.pets[pet.speciesId].lessons;
}

export function recommendedPetDeck(pet, content) {
    const lessons = petLessons(pet, content).filter(x => x.level <= pet.level);
    const out = [];
    let left = petCapacity(pet, content);
    for (const row of [...lessons].reverse()) {
        const count = Math.min(petParams(content).petCopies, left);
        if (count) {
            out.push({ key: row.key, count });
            left -= count;
        }
    }
    return out;
}

export function validatePetDeck(pet, content, deck) {
    check(Array.isArray(deck) && deck.length > 0, '宠物卡包不能为空');
    const seen = new Set();
    let count = 0;
    for (const row of deck) {
        check(
            !seen.has(row.key) &&
                Number.isInteger(row.count) &&
                row.count > 0 &&
                row.count <= petParams(content).petCopies &&
                petLessons(pet, content).some(x => x.key === row.key && x.level <= pet.level),
            '宠物卡牌尚未解锁或份数无效',
        );
        seen.add(row.key);
        count += row.count;
    }
    check(count <= petCapacity(pet, content), '宠物卡包容量不足');
}
