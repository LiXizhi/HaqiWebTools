import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {shopBagComparison,shopEquipmentComparison,restoreShopPurchaseFocus} from '../js/view_adventure_shop_comparison.js';
import {createAdventure,applyAction} from '../js/adventure_core.js';
import {equipmentSummary} from '../js/adventure_equipment_core.js';
const read=name=>JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const {content}=installExpansion(...['adventure/chapter','adventure/combat','adventure/pets','adventure/shop-candidates','kids/cards','kids/charms','kids/card_names'].map(read));
const fresh=()=>({defaultPocketVersion:1,equipment:{}});

function hero(){const save=createAdventure(content);save.level=50;save.school='fire';return save;}
test('new gear preview matches actual base equip, ignores stale instance upgrades and preserves save',()=>{
    const save=hero();delete save.inventory[1240];save.upgrades[1240]=10;
    save.equipmentInstances.push({guid:'equipment-999',gsid:1240,serverdata:{addlel:10,gem:{holecnt:0,ins:[99991]}}});
    const before=structuredClone(save),result=shopEquipmentComparison(save,1240,content);
    assert.match(result.label,/新件试穿（无强化、无宝石）/);
    const equipped=structuredClone(save);equipped.inventory[1240]=1;delete equipped.upgrades[1240];
    equipped.equipmentInstances=equipped.equipmentInstances.filter(row=>row.gsid!==1240);
    applyAction(equipped,content,{type:'equip',itemId:1240});
    const actual=new Map(equipmentSummary(equipped,content,0).map(row=>[row.key,row.value]));
    const current=new Map(equipmentSummary(save,content,0).map(row=>[row.key,row.value]));
    assert.equal(result.rows.length,4);
    for(const row of result.rows){assert.equal(row.value,actual.get(row.key));assert.equal(row.before,current.get(row.key));}
    assert.equal(result.rows.find(row=>row.key==='hp').delta,30);
    assert.deepEqual(save,before);
});
test('owned selected instance retains its sockets and comparisons include replacement losses',()=>{
    const copy=structuredClone(content);copy.items[99991]={id:99991,stats:{101:77}};
    const save=hero();save.inventory[1240]=2;
    save.equipmentInstances=[{guid:'equipment-1',gsid:1240,serverdata:{addlel:0}},
        {guid:'equipment-2',gsid:1240,serverdata:{addlel:0,gem:{holecnt:0,ins:[99991]}}}];
    save.equipment[2]=1240;save.equipmentGuids[2]='equipment-2';
    const same=shopEquipmentComparison(save,1240,copy);
    assert.match(same.label,/已有实例/);assert.ok(same.rows.every(row=>row.delta===0));
    // A lower-HP alternative in the same slot must expose the loss, not promise improvement.
    copy.items[99992]={...copy.items[1240],id:99992,stats:{...copy.items[1240].stats,101:10}};
    const before=structuredClone(save),lower=shopEquipmentComparison(save,99992,copy);
    assert.equal(lower.rows[0].key,'hp');assert.equal(lower.rows[0].delta,-97);
    assert.deepEqual(save,before);
});
test('preview is unavailable for bags, non-equipment, missing items and blocked school or level',()=>{
    const save=hero();assert.equal(shopEquipmentComparison(save,24001,content),null);
    assert.equal(shopEquipmentComparison(save,17213,content),null);
    assert.equal(shopEquipmentComparison(save,-1,content),null);
    save.school='ice';assert.equal(shopEquipmentComparison(save,1240,content),null);
    save.school='fire';save.level=0;assert.equal(shopEquipmentComparison(save,1240,content),null);
});

test('real starter and next bag show current and target limits without equipping',()=>{
    const save=fresh(),before=structuredClone(save);
    assert.equal(shopBagComparison(save,24001,content),'卡牌容量 10 → 12 张；同张可带 2 → 2 张。装备后生效，购买不会自动装备。');
    save.equipment[24]=24001;
    assert.equal(shopBagComparison(save,24002,content),'卡牌容量 12 → 18 张；同张可带 2 → 3 张。装备后生效，购买不会自动装备。');
    assert.equal(save.equipment[24],24001);
    delete save.equipment[24];assert.deepEqual(save,before);
});
test('equipped and lower-capacity bags do not promise an upgrade',()=>{
    const save=fresh();save.equipment[24]=24002;
    assert.equal(shopBagComparison(save,24002,content),'卡牌容量 18 → 18 张；同张可带 3 → 3 张。当前使用。');
    assert.equal(shopBagComparison(save,24001,content),'卡牌容量 18 → 12 张；同张可带 3 → 2 张。容量与同卡张数均无增益。');
});
test('legacy default pocket uses real 14/3 rules',()=>{
    assert.equal(shopBagComparison({equipment:{}},24001,content),'卡牌容量 14 → 12 张；同张可带 3 → 2 张。容量与同卡张数均无增益。');
});
function focusFixture(){
    const focused=[],state={};
    const node=id=>({isConnected:true,dataset:{shopProductId:id},focus:()=>focused.push(id)});
    const trigger=node('old'),replacement=node('gear:24001'),other=node('other');
    const modal={shopViewState:state,contains:n=>n===trigger,querySelectorAll:()=>[other,replacement]};
    const root={isConnected:true,querySelector:()=>modal};
    return {focused,state,trigger,replacement,modal,root,productId:'gear:24001'};
}
test('normal close retains trigger and redraw close restores same product',()=>{
    const f=focusFixture();restoreShopPurchaseFocus(f);assert.deepEqual(f.focused,['old']);
    f.trigger.isConnected=false;restoreShopPurchaseFocus(f);assert.deepEqual(f.focused,['old','gear:24001']);
});
test('successful use navigation, changed panel/session and detached roots do not steal focus',()=>{
    const f=focusFixture();restoreShopPurchaseFocus({...f,navigating:true});
    f.modal.shopViewState={};restoreShopPurchaseFocus(f);
    f.root.querySelector=()=>null;restoreShopPurchaseFocus(f);
    f.root.isConnected=false;restoreShopPurchaseFocus(f);
    assert.deepEqual(f.focused,[]);
});
test('disabled replacement is not focused',()=>{
    const f=focusFixture();f.trigger.isConnected=false;f.replacement.disabled=true;
    restoreShopPurchaseFocus(f);assert.deepEqual(f.focused,[]);
});
