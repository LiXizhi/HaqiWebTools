import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareOriginalImport,ORIGINAL_IMPORT_BAGS} from '../js/haqi_import_core.js';
import {parseSave} from '../js/adventure_core.js';
import {installExpansion} from '../js/adventure_expansion_core.js';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/adventure/${name}.json`,import.meta.url)));
const content=read('chapter'),dataset=read('combat');
const cardId=Number(Object.keys(content.cardItems).find(id=>content.learn.fire.some(row=>row.key===content.cardItems[id])));
const item=(guid,gsid,position,extra={})=>({guid,gsid,position,copies:1,...extra});
const snapshot=()=>({name:'原角色',school:'fire',level:10,xp:4654,owner:'PRIVATE_OWNER',token:'PRIVATE_TOKEN',nid:123,inventory:[
    {bag:0,items:[item(88,1912,11,{serverdata:'{"addlel":2,"token":"PRIVATE_TOKEN"}'})]},
    {bag:1,items:[item(89,1912,11,{serverdata:{addlel:1}})]},
    {bag:24,items:[item(90,cardId,1,{copies:3})]},
    {bag:25,items:[]},
]});
test('limited bag IDs match original equipment, learned card and rune Lua bags',()=>{
    assert.deepEqual(ORIGINAL_IMPORT_BAGS,[0,1,24,25]);assert.ok(Object.isFrozen(ORIGINAL_IMPORT_BAGS));
});
test('original numeric school IDs import all five supported schools after four bags are read',()=>{
    for (const [id,school] of [[986,'fire'],[987,'ice'],[988,'storm'],[990,'life'],[991,'death']]) {
        for (const value of [id,String(id)]) {
            const raw=snapshot();raw.school=value;
            const before=structuredClone(raw);
            const {save}=prepareOriginalImport(raw,content,dataset);
            assert.equal(save.school,school);assert.equal(save.level,10);
            assert.equal(save.inventory[1912],1);assert.deepEqual(raw,before);
            assert.deepEqual(parseSave(save,content),save);
        }
    }
    for (const school of [989,992,999,null]) {
        const raw=snapshot();raw.school=school;
        assert.throws(()=>prepareOriginalImport(raw,content,dataset),/学系暂不支持/);
    }
});
test('pure import merges unique equipment with highest upgrade, independent adventure and safe metadata',()=>{
    const raw=snapshot(),before=structuredClone(raw),c=structuredClone(content),d=structuredClone(dataset);
    const result=prepareOriginalImport(raw,c,d),s=result.save;
    assert.deepEqual(raw,before);assert.deepEqual(c,content);assert.deepEqual(d,dataset);
    assert.equal(s.equipmentGuids[11],'equipment-88');assert.equal(s.equipmentInstances.length,1);
    assert.deepEqual(s.equipmentInstances.map(row=>row.serverdata.addlel),[2]);
    assert.equal(s.inventory[1912],1);assert.equal(s.inventory[100],undefined);
    assert.equal(s.level,10);assert.equal(s.pendingEncounter,null);assert.deepEqual(s.quests,{});
    assert.equal(s.encounterSerial,0);assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
    assert.deepEqual(parseSave(s,c),s);assert.deepEqual(prepareOriginalImport(raw,c,d),result);
});
test('ignores out-of-scope inventory and warns on unknown, malformed, duplicate and stacked equipment',()=>{
    const raw=snapshot();raw.inventory.push({bag:99,items:[item(100,1912,11)]});
    raw.inventory[1].items.push(item(88,1912,11),item(91,999999,1),item(92,1912,1,{copies:2}),item(93,1912,1,{serverdata:'{x=execute()}'}),item(94,1912,1,{serverdata:{addlel:999}}));
    const result=prepareOriginalImport(raw,content,dataset);
    assert.equal(result.save.inventory[1912],1);assert.equal(result.summary.skipped,5);
    assert.match(result.warnings.join('\n'),/范围外/);assert.match(result.warnings.join('\n'),/重复/);
});
test('wrong equipped position remains inventory; bag 1 position never means equipped',()=>{
    const raw=snapshot();raw.inventory[0].items[0].position=12;
    const {save}=prepareOriginalImport(raw,content,dataset);
    assert.equal(save.equipment[11],undefined);assert.equal(save.inventory[1912],1);
});
test('recognized socket data survives and unverified gems skip whole equipment',()=>{
    const c=structuredClone(content);c.items[1912].stats[36]=2;c.items[26001]={id:26001,stats:{42:1}};
    c.gemCatalog={items:{26001:{stats:{42:1}}}};
    const raw=snapshot();raw.inventory[0].items[0].serverdata={addlel:2,gem:{holecnt:2,ins:[26001]}};
    let result=prepareOriginalImport(raw,c,dataset);assert.deepEqual(result.save.equipmentInstances[0].serverdata.gem,{holecnt:2,ins:[26001]});
    raw.inventory[0].items[0].serverdata.gem.ins=[999];result=prepareOriginalImport(raw,c,dataset);
    assert.equal(result.save.equipmentInstances.length,1);assert.match(result.warnings.join('\n'),/镶嵌/);
});
test('Lua flat card bag array imports only verified owned supported cards and clamps copies',()=>{
    const raw=snapshot();raw.inventory[0].items.push(item(95,24003,24,{clientdata:`{${cardId},${cardId},${cardId},${cardId},999999,}`}));
    const result=prepareOriginalImport(raw,content,dataset);
    assert.equal(result.save.equipment[24],24003);
    assert.deepEqual(result.save.deck,[{key:content.cardItems[cardId],count:Math.min(3,content.items[24003].stats[170])}]);
    assert.match(result.warnings.join('\n'),/已跳过/);assert.match(result.warnings.join('\n'),/裁剪/);
    raw.inventory[0].items.at(-1).clientdata='{loadstring("evil")()}';
    assert.match(prepareOriginalImport(raw,content,dataset).warnings.join('\n'),/推荐卡组/);
});
test('expanded adventure remains round-trippable with original equipment and learned cards',()=>{
    const names=['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'];
    const {content:c,dataset:d}=installExpansion(...names.map(name=>JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url)))));
    const {save}=prepareOriginalImport(snapshot(),c,d);
    assert.deepEqual(parseSave(save,c),save);assert.equal(save.equipmentGuids[11],'equipment-88');
});
test('rejects invalid role and repeated source bags; clamps imported level safely',()=>{
    for(const value of [{...snapshot(),school:'myth'},{...snapshot(),level:0},{...snapshot(),inventory:null}])assert.throws(()=>prepareOriginalImport(value,content,dataset));
    const raw=snapshot();raw.inventory.push({bag:0,items:[]});assert.throws(()=>prepareOriginalImport(raw,content,dataset));
    raw.inventory.pop();raw.level=999;assert.equal(prepareOriginalImport(raw,content,dataset).save.level,content.progression.levelCap);
});
