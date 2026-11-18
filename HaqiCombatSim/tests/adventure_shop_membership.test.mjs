import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createShopMembershipSummary} from '../js/views/adventure/view_adventure_shop_membership.js';
import {magicStarWeek} from '../js/adventure_magic_star_core.js';

const magicStar=JSON.parse(readFileSync(new URL('../data/adventure/magic-star.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-14T17:00:00Z');
const active={status:'ready',isVip:true,expiresAt:'2026-12-01T00:00:00Z'};
const linkText='查看每周仙豆与法杖领取条件';
const ui={
    el:(tag,className,...children)=>({tag,className,children,dataset:{},append(...nodes){this.children.push(...nodes);}}),
    button:(label,onClick,className)=>({tag:'button',label,onClick,className})
};
function render(overrides={},panel=()=>{}) {
    return createShopMembershipSummary({now,assets:{content:{magicStar}},save:{},membership:active,...overrides},{panel},ui);
}
function assertConditionsOnly(node) {
    assert.equal(node.children.length,1,'uncertain or inactive membership must not promise a reward');
    assert.equal(node.children[0].label,linkText);
}

test('loading membership does not advertise stale VIP rewards',()=>{
    assertConditionsOnly(render({membership:{...active,status:'loading'}}));
});
test('guest sees conditions without the unused level-zero 300 reward',()=>{
    assertConditionsOnly(render({membership:{status:'guest',isVip:false}}));
});
test('level one shows 360 fairy beans and actual claim restrictions',()=>{
    const node=render();
    assert.equal(node.children[0].textContent,'魔法星1级 · 本周可领取360仙豆');
    const conditions=node.children[1].children.join('');
    assert.match(conditions,/每角色每周领取一次/);
    assert.match(conditions,/魔法星和角色等级/);
    assert.match(conditions,/每件只领一次，已拥有不重复发放/);
});
test('level ten shows the configured 1200 rather than a fixed first-tier reward',()=>{
    const node=render({membership:{...active,expiresAt:'2027-11-14T17:00:00Z'}});
    assert.equal(node.children[0].textContent,'魔法星10级 · 本周可领取1200仙豆');
});
test('current or future claim record does not promise another reward',()=>{
    for(const week of [magicStarWeek(now),magicStarWeek(now)+1]){
        const node=render({save:{magicStarClaims:{week}}});
        assert.equal(node.children[0].textContent,'魔法星1级 · 本周360仙豆已领取');
    }
    assert.match(render({save:{magicStarClaims:{week:magicStarWeek(now)-1}}}).children[0].textContent,/可领取360仙豆/);
});
test('expired membership cannot claim even if the cached VIP flag remains true',()=>{
    assertConditionsOnly(render({membership:{...active,expiresAt:'2026-11-14T17:00:00Z'}}));
});
test('missing configuration or malformed claims fall back to the conditions link',()=>{
    assertConditionsOnly(render({assets:{content:{}}}));
    assertConditionsOnly(render({save:{magicStarClaims:{week:'invalid'}}}));
    assertConditionsOnly(render({now:NaN}));
});
test('conditions button navigates only on click and never grants rewards',()=>{
    const panels=[],save={inventory:{17213:17}},before=structuredClone(save);
    const node=render({save},panel=>panels.push(panel));
    assert.deepEqual(panels,[]);
    node.children.at(-1).onClick();
    assert.deepEqual(panels,['membership']);
    assert.deepEqual(save,before);
});
