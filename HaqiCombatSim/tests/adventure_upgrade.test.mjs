import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as A from '../js/adventure_core.js';
import {upgradeLevels,upgradeAt,applyUpgradeStats} from '../js/adventure_upgrade_core.js';
import {normalizeStats} from '../js/combat_unit_core.js';
import {renderStrengthening} from '../js/view_adventure_strengthening.js';
import {findEquipmentInstance} from '../js/adventure_equipment_instances_core.js';
const content=JSON.parse(fs.readFileSync(new URL('../data/adventure/chapter.json',import.meta.url)));
const q=content.quests.find(q=>q.id===63007);
function hero(){
    const s=A.createAdventure(content);s.xp=4654;A.syncProgression(s,content);
    for(const quest of content.quests.filter(q=>q.id<63007))s.quests[quest.id]={accepted:true,claimed:true,progress:Object.fromEntries(quest.goals.map(g=>[`${g.kind}:${g.id}`,g.count]))};
    s.inventory={1912:1,1240:1,17213:490};return s;
}
const act=(s,type,props={})=>A.applyAction(s,content,{type,...props});
test('original goal 79016 requires successful upgrade after acceptance; any configured equipment qualifies',()=>{
    const s=hero();act(s,'upgrade',{itemId:1912});
    act(s,'accept',{questId:q.id,npcId:q.startNpc});
    assert.equal(A.questReady(s,q),false);
    act(s,'equip',{itemId:1912});assert.equal(A.questReady(s,q),false);
    act(s,'upgrade',{itemId:1240});assert.equal(s.inventory[17213],350);
    assert.equal(A.questReady(s,q),true);
    act(s,'claim',{questId:q.id,npcId:q.endNpc});assert.equal(s.inventory[17213],550);
    assert.equal(s.inventory[17307],1);assert.equal(A.currentQuest(s,content).id,63008);
    assert.deepEqual(A.parseSave(s,content),s);
});
test('insufficient materials, unknown equipment and maximum level leave save and goal unchanged',()=>{
    const s=hero();act(s,'accept',{questId:q.id,npcId:q.startNpc});s.inventory[17213]=69;
    for(const id of [1912,17213,999999]){const before=structuredClone(s);assert.throws(()=>act(s,'upgrade',{itemId:id}));assert.deepEqual(s,before);}
    s.upgrades[1912]=3;const before=structuredClone(s);assert.throws(()=>act(s,'upgrade',{itemId:1912}));assert.deepEqual(s,before);assert.equal(A.questReady(s,q),false);
});
test('all exported GSIDs have contiguous levels and exact Lua requirement pairs',()=>{
    const ids=content.upgradeGroups.flatMap(g=>g.gsids);assert.equal(ids.length,468);assert.equal(new Set(ids).size,468);
    for(const id of ids)for(const [i,row] of upgradeLevels(content,id).entries()){
        assert.equal(row.level,i+1);assert.deepEqual(row.cost,JSON.parse(row.levelup_requirement.replace('{','[').replace('}',']')));
    }
    assert.deepEqual(upgradeLevels(content,1912),content.upgrade);
    assert.deepEqual(upgradeLevels(content,1240),content.upgrade);
    assert.deepEqual(upgradeLevels(content,24003),[]);
});
test('six Lua strengthening contributions are cumulative target values, only equipped items contribute',()=>{
    const stats=normalizeStats();applyUpgradeStats(stats,{attack_percentage:3,attack_absolute:7,resist_absolute:5,hp:80,critical_strike_percent:2,resilience_percentage:4});
    assert.equal(stats.damagePct.all,3);assert.equal(stats.damageAbs.all,7);assert.equal(stats.resistAbs.all,5);assert.equal(stats.hpFlat,80);assert.equal(stats.critPct.all,2);assert.equal(stats.resiliencePct.all,4);
    const s=hero();act(s,'equip',{itemId:1240});const base=A.playerSpec(s,content).stats.damagePct.all||0;
    act(s,'upgrade',{itemId:1240});act(s,'upgrade',{itemId:1240});assert.equal(A.playerSpec(s,content).stats.damagePct.all,base+2);
    act(s,'unequip',{slot:2});assert.equal(A.playerSpec(s,content).stats.damagePct.all||0,0);assert.equal(s.upgrades[1240],2);
    const mixed=content.upgradeGroups.find(g=>g.levels.some(row=>row.hp&&row.resilience_percentage));
    assert.ok(mixed);assert.ok(upgradeAt(content,mixed.gsids[0],2).cost[0]!==17213);
});
test('strengthening panel exposes working button before equipment comparison and completes task',()=>{
    const s=hero();act(s,'accept',{questId:q.id,npcId:q.startNpc});
    class Element{
        constructor(tag,cls,...children){this.tag=tag;this.children=children.flat();this.attributes={};this.style={};}
        append(...children){this.children.push(...children.flat());}
        replaceChildren(...children){this.children=children;}
        setAttribute(k,v){this.attributes[k]=v;}
    }
    const el=(...args)=>new Element(...args),button=(label,fn,cls)=>{const b=el('button',cls,label);b.onclick=fn;return b;};
    const ui={el,button,art:()=>el('canvas'),tile:()=>el('canvas'),spellFace:()=>el('canvas')};
    const body=el('div');
    renderStrengthening(body,{save:s,assets:{content,dataset:{cards:{}}},strengtheningView:{guid:findEquipmentInstance(s,content,1912).guid,filter:0,page:0}},{action:a=>A.applyAction(s,content,a)},ui);
    const all=node=>[node,...node.children.filter(x=>x instanceof Element).flatMap(all)];
    const b=all(body).find(node=>node.tag==='button'&&node.children[0]==='强 化');
    assert.ok(b);assert.equal(b.disabled,false);b.onclick();assert.equal(A.questReady(s,q),true);assert.equal(s.inventory[17213],420);
});
