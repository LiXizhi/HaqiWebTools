import { installFishing } from './adventure_fishing_core.js';

// Inventory/save validation needs item metadata before the fishing activity opens.
// Reward tables are fetched only on demand, with concurrent requests coalesced.
export function createFishingLoader(content, items, readJson) {
    for (const item of Object.values(items)) {
        content.items[item.id] ??= { id:item.id, name:item.name, description:item.description, kind:item.kind, sourceIcon:item.sourceIcon, stats:{}, slot:0 };
    }
    let pending;
    return function loadFishing() {
        if (!pending) pending = Promise.resolve().then(() => readJson('data/adventure/fishing.json'))
            .then(catalog => { installFishing(content, catalog);return catalog; })
            .catch(error => { pending = null;throw error; });
        return pending;
    };
}
