import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createWorld, walkable, findPath, followPath, distance} from '../js/adventure_world_core.js';
import {segmentDistance} from '../js/adventure_island_layout_core.js';
import {onAnyBridge} from '../js/adventure_bridge_core.js';
import {installNpcCatalog} from '../js/adventure_npc_core.js';
import {replaceMonsterCards} from '../js/adventure_monster_cards_core.js';
import {validateSpellEffects} from '../js/spell_effects_core.js';

const root = new URL('../', import.meta.url);
const read = name => JSON.parse(fs.readFileSync(new URL(name, root), 'utf8'));
const chapter = read('data/adventure/chapter.json');
const source = read('data/adventure/monster-catalog.json');
const quests = read('data/adventure/quest-runtime.json');
const replacements = read('config/monster-card-replacements.json'), cards = read('data/kids/cards.json');
validateSpellEffects(read('data/adventure/spell-effects.json'), Object.fromEntries(Object.values(replacements.cards).map(row => [row.key, cards[row.key]])));
const worlds = {fire:'FlamingPhoenixIsland', ice:'FrostRoarIsland', desert:'AncientEgyptIsland', dark:'DarkForestIsland'};
chapter.worldMaps = Object.fromEntries(Object.keys(worlds).map(id => [id, read(`data/adventure/maps/${id}.json`)]));
installNpcCatalog(chapter, read('data/adventure/npc-catalog.json'));
const children = (node, tag) => (node?.children || []).filter(n => n.tag === tag);
const child = (node, tag) => children(node, tag)[0];
const card = id => chapter.cardItems[id] || id;
const pool = value => [...(value || '').matchAll(/\((\d+),(\d+)\)/g)].map(m => ({key:card(m[1]), weight:Number(m[2])}));
const output = {version:1, adaptation:'保留原岛屿法阵的全部怪物与卡位；野外站在路边空地，只有副本怪物站在道路上。子场景任务目标保留单怪入口。', monsters:{}, encounters:[]};

const SHOULDER_GAPS = [32, 48, 76, 108, 148, 190];
function roadClearance(paths, p) {
    let best = Infinity;
    for (const path of paths) best = Math.min(best, segmentDistance(p, path.a, path.b) - (path.width || 60) / 2);
    return best;
}
function reachable(world, p) {
    const end = followPath(world, world.layout.spawn, findPath(world, world.layout.spawn, p), 100000);
    return !end.blocked && distance(end.position, p) <= 1;
}
function openGroundSpots(world, occupied) {
    const spots = [];
    const radius = world.monsterSceneParams.territoryRadius;
    const landings = [world.layout.spawn, world.layout.initialSpawn || world.layout.spawn];
    const blocked = p => [...occupied, ...spots].some(o => distance(o, p) < 108)
        || landings.some(spawn => distance(spawn, p) < radius + 48);
    for (const path of world.paths) {
        const length = distance(path.a, path.b);
        if (length < 110) continue;
        const dx = (path.b.x - path.a.x) / length, dy = (path.b.y - path.a.y) / length;
        const nx = -dy, ny = dx, half = (path.width || 60) / 2;
        for (let d = 70; d < length - 50; d += 100) {
            for (const side of [-1, 1]) {
                let chosen = null;
                for (const gap of SHOULDER_GAPS) {
                    const p = {
                        x: Math.round(path.a.x + dx * d + nx * (half + radius + gap) * side),
                        y: Math.round(path.a.y + dy * d + ny * (half + radius + gap) * side),
                    };
                    if (!walkable(world, p.x, p.y) || blocked(p)) continue;
                    const clearance = roadClearance(world.paths, p);
                    if (clearance < radius + 16 || onAnyBridge(world, p.x, p.y, 88) || !reachable(world, p)) continue;
                    chosen = {...p, clearance};
                    break;
                }
                if (chosen) spots.push(chosen);
            }
        }
    }
    return spots;
}
function bodyClearance(encounter) {
    const count = encounter.monsterIds?.length || 1;
    const scale = encounter.monsterIds ? .7 : .8;
    const half = 52 * scale + (count > 1 ? (count - 1) / 2 * 42 : 0);
    return Math.max(40, half + 8);
}
function claimSpot(spots, prefer, need) {
    let best = -1, score = Infinity;
    for (let i = 0; i < spots.length; i++) {
        const spot = spots[i];
        if (!spot || spot.used) continue;
        const miss = Math.max(0, need - spot.clearance);
        const away = Math.min(Math.abs(i - prefer), spots.length - Math.abs(i - prefer));
        const rank = miss * 1000 + away;
        if (rank < score) { score = rank; best = i; }
    }
    if (best < 0) return null;
    spots[best].used = true;
    return spots[best];
}
for (const [zone, originalWorld] of Object.entries(worlds)) {
    const templates = new Set(source.placements.filter(p => p.world === originalWorld).flatMap(p => p.templates));
    const goals = new Set(quests.quests.filter(q => q.region === zone).flatMap(q => q.groups.flatMap(g =>
        g.items.flatMap(i => g.kind === 'kill' ? [i.id] : g.kind === 'loot' ? i.producers : []))));
    // Include story targets whose original arena lived in an island sub-scene.
    for (const [path, id] of Object.entries(quests.paths)) if (goals.has(id)) {
        const original = Object.keys(source.templates).find(p => p.toLowerCase() === path);
        if (!original) throw Error(`任务怪物模板缺失：${zone}/${id}`);
        templates.add(original);
    }
    const world = createWorld(zone, chapter), occupied = [...world.npcs, ...world.landmarks, world.portal, world.layout.spawn];
    const spots = openGroundSpots(world, occupied);
    const paths = [...templates].sort();
    if (spots.length < paths.length) throw Error(`岛屿路边空地不足：${zone}`);
    for (const [index, path] of paths.entries()) {
        const tree = source.templates[path], attributes = child(tree,'mob')?.attributes;
        if (!attributes) throw Error(`怪物数据缺失：${path}`);
        const monster = {id:path, source:path, name:attributes.displayname || attributes.name, school:attributes.phase,
            level:Number(attributes.level || 1), hp:Number(attributes.hp || 0), xp:Number(attributes.experience_pts || 0), coins:Number(attributes.joybean_count || 0),
            attributes:Object.fromEntries(Object.entries(attributes).map(([k,v]) => [k, v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v])),
            pool:pool(attributes.available_cards),
            sequences:children(child(tree,'sequences'),'sequence').map(seq => (seq.children || []).map(n => ({...n.attributes, card:card(n.attributes.card || '')}))),
            genes:children(child(tree,'genes'),'gene').map(n => ({...n.attributes, ...(n.attributes.card ? {card:card(n.attributes.card)} : {})})),
            cardsets:Object.fromEntries(children(child(tree,'cardsets'),'set').map(n => [n.attributes.id, pool(n.attributes.cards)]))};
        const adapted = replaceMonsterCards(monster, replacements, cards);
        output.monsters[adapted.id] = adapted;
        const position = claimSpot(spots, Math.floor(index * spots.length / paths.length), bodyClearance({monsterId:adapted.id}));
        const route = findPath(world, world.layout.spawn, position);
        const end = followPath(world, world.layout.spawn, route, 100000);
        if (!route.length || end.blocked || distance(end.position, position) > 1) throw Error(`怪物位置不可达：${zone}/${path}`);
        output.encounters.push({id:`island:${zone}:${path}`, zone, monsterId:adapted.id, x:position.x, y:position.y});
    }
    const placements = source.placements.filter(p => p.world === originalWorld);
    const placed = new Set(placements.flatMap(p => p.templates));
    const legacy = output.encounters.filter(e => e.zone === zone);
    // Keep the old IDs solely for battles saved before formations were restored.
    for (const e of legacy) if (placed.has(output.monsters[e.monsterId].source)) e.legacyOnly = true;
    const formations = placements.map(p => {
        const slots = children(p.data, 'mob').map(m => m.attributes.mob_template || null);
        const monsterIds = slots.filter(Boolean).map(path => {
            const m = Object.values(output.monsters).find(m => m.source === path);
            if (!m) throw Error(`法阵怪物缺失：${p.id}/${path}`);
            return m.id;
        });
        return {id:`island:${zone}:arena:${p.id}`, zone, monsterId:monsterIds[0], monsterIds,
            monsterSlots:slots.flatMap((id,i) => id ? [i] : []), sourceArenaId:p.id,
            source:p.source, arenaAttributes:p.data.attributes};
    });
    const visible = [...formations, ...legacy.filter(e => !e.legacyOnly)];
    for (const spot of spots) delete spot.used;
    if (spots.length < visible.length) throw Error(`岛屿法阵路边空地不足：${zone}`);
    for (const [i,e] of visible.entries()) {
        const spot = claimSpot(spots, Math.floor(i * spots.length / visible.length), bodyClearance(e));
        Object.assign(e, {x:spot.x, y:spot.y});
        const end = followPath(world, world.layout.spawn, findPath(world,world.layout.spawn,e),100000);
        if (end.blocked || distance(end.position,e)>1) throw Error(`法阵不可达：${e.id}`);
    }
    output.encounters.push(...formations);
    const populated = {...chapter, monsters:{...chapter.monsters,...output.monsters},
        encounters:[...chapter.encounters.filter(e=>e.zone!==zone),...output.encounters.filter(e=>e.zone===zone)]};
    let finalWorld = createWorld(zone, populated);
    for (const encounter of visible) {
        if (reachable(finalWorld, encounter)) continue;
        let replacement = null;
        for (const spot of spots) {
            if (spot.used) continue;
            const previous = {x:encounter.x,y:encounter.y};
            Object.assign(encounter,{x:spot.x,y:spot.y});
            const candidateWorld = createWorld(zone,populated);
            if (visible.every(row=>reachable(candidateWorld,row))) {
                replacement = spot;finalWorld = candidateWorld;break;
            }
            Object.assign(encounter,previous);
        }
        if (!replacement) throw Error(`完整场景法阵不可达：${encounter.id}`);
        replacement.used = true;
    }
}
const file = new URL('data/adventure/island-encounters.json',root), text = JSON.stringify(output,null,2)+'\n';
if (process.argv.includes('--check')) {
    if (fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n') !== text) throw Error('岛屿怪物配置过期，请运行 npm run prepare:island-encounters');
} else fs.writeFileSync(file,text);
console.log(`${fileURLToPath(file)}：${output.encounters.length} 处岛屿遭遇，可达性通过`);
