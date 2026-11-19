// pets/pet_loader.js — 负责分片宠物文件的按需读取、去重与切换角色后的异步失效保护。
export function createPetLoader({ getState }) {
    const petLoads = new Map();

    return async function loadPet(id) {
        const state = getState();
        if (state.save.pets[id] || state.save.petWorld?.[id]) {
            return state.save.pets[id] || state.save.petWorld[id];
        }
        const current = state.save;
        const roleId = state.roleStore.catalog.activeId;
        const owner = state.roleStore.owner;
        const ref = state.save.petFileRefs?.[id];
        if (!ref) throw Error('找不到宠物引用');
        const key = JSON.stringify([owner, roleId, id, ref.path]);
        if (petLoads.has(key)) return petLoads.get(key);

        const task = (async () => {
            try {
                state.roleStore.petFileIO(roleId).read(ref.path);
            } catch (error) {
                if (!owner || state.cloudClient.owner !== owner) throw error;
                await state.cloudClient.petFile(roleId, ref.path);
            }
            const latest = getState();
            if (
                latest.save !== current
                || latest.roleStore.catalog.activeId !== roleId
                || latest.roleStore.owner !== owner
            ) {
                return null;
            }
            const next = latest.roleStore.loadPet(current, id);
            const pet = next[ref.group][id];
            current[ref.group][id] = pet;
            return pet;
        })().finally(() => petLoads.delete(key));

        petLoads.set(key, task);
        return task;
    };
}
