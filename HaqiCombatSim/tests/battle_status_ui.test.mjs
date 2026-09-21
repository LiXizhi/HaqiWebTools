import test from 'node:test';
import assert from 'node:assert/strict';
import {createBattleRoster,updateBattleRoster,battleStatusLabels} from '../js/view_adventure_battle_status.js';
import {CardRenderer} from '../js/card_renderer.js';

function el(tag,cls,...children){
    const node={tag,cls,children:children.flat(),style:{setProperty(){}},attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},append(child){this.children.push(child);}};
    if(tag==='canvas')node.getContext=()=>new Proxy({}, {get:()=>()=>{}});
    Object.defineProperties(node,{firstChild:{get(){return this.children[0];}},lastChild:{get(){return this.children.at(-1);}}});
    node.classList={toggle(k,on){node[k]=on;}};return node;
}
const unit=(id,side)=>({id,side,name:id,school:'ice',level:5,hp:100,maxHp:200,pips:{normal:2,power:1},standingWards:[],charms:[],wards:[],dots:[],hots:[]});
test('four combatants per side retain separate status, targeting, mana and self treatment',()=>{
    const battle={sides:{near:Array.from({length:4},(_,i)=>unit(`hero${i}`,'near')),far:Array.from({length:4},(_,i)=>unit(`mob${i}`,'far'))},resolved:{global:{stormChargingWardIds:[]},charms:{},wards:{}}};
    const calls=[],options={heroId:'hero0',canTarget:u=>u.side==='far',target:id=>calls.push(id),el,button:(children,fn,cls)=>Object.assign(el('button',cls,children),{click:fn}),schoolNames:{ice:'寒冰'},colors:{ice:'#6ecbdc'}};
    const near=createBattleRoster(battle,'near',options),far=createBattleRoster(battle,'far',options);
    assert.equal(near.entries.length,4);assert.equal(far.entries.length,4);
    assert.equal(near.entries.filter(r=>r.node.cls.includes('is-self')).length,1);
    assert.ok(near.entries.every(r=>r.node.disabled));assert.ok(far.entries.every(r=>!r.node.disabled));
    far.entries[2].node.click();assert.deepEqual(calls,['mob2']);
    assert.equal(near.entries[0].node.children[2].attrs['aria-label'],'普通魔力 2，超级魔力 1');
    assert.equal(near.entries[0].node.children[2].children.length,3);
    const row=near.entries[0];updateBattleRoster([row],{hp:{hero0:180}});
    assert.equal(row.value.textContent,'180 / 200');assert.equal(row.fill.style.width,'90%');
    updateBattleRoster([row],{hp:{hero0:0}});assert.equal(row.node['is-defeated'],true);
    updateBattleRoster([row],null);assert.equal(row.value.textContent,'100 / 200');assert.equal(row.node['is-defeated'],false);
});
test('corner status preserves charm, ward, periodic and stun information',()=>{
    const u={...unit('hero','near'),charms:[1],wards:[{id:2}],dots:[{}],hots:[{}],stunned:true};
    assert.deepEqual(battleStatusLabels(u,{resolved:{charms:{1:{desc:'提升攻击'}},wards:{2:{desc:'抵御伤害'}}}}),['提升攻击','抵御伤害','持续伤害','持续治疗','眩晕']);
});
test('corner status exposes reflection capacity and remaining stealth rounds',()=>{
    const current={...unit('hero','near'),reflectAmount:250,stealth:true,stealthRounds:2};
    assert.deepEqual(battleStatusLabels(current,{resolved:{}}),['反射盾 250','隐身 · 2回合']);
    current.reflectAmount=0;current.stealthRounds=null;
    assert.deepEqual(battleStatusLabels(current,{resolved:{}}),['隐身']);
});
test('variant qualities use a thick bottom strip without a whole-card outline',()=>{
    for(const color of [null,'#93ee87','#80c9ff','#d09aff','#ffdb70']){
        const rects=[],strokes=[];
        const c=new Proxy({fillRect(...args){rects.push({color:this.fillStyle,args});},strokeRect(...args){strokes.push(args);},createRadialGradient:()=>({addColorStop(){}})}, {get:(o,k)=>k in o?o[k]:()=>{}});
        const renderer=new CardRenderer({images:new Map(),effects:{cards:{test:{base:'test',variant:{rank:'quality'},name:'测试'}},variantAuras:{quality:{color}}},drawSubject(){}});
        renderer.draw(c,{key:'test',type:'Pass',spellSchool:'ice',params:{}},{details:false});
        assert.equal(strokes.length,0);
        assert.equal(rects.some(r=>r.color===color&&r.args.join(',')==='7,441,288,15'),!!color);
    }
});
