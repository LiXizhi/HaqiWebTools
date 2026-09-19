import {drawSchoolIcon} from './card_renderer.js';

// Corner rosters share the arena's target callbacks; no battle state is mutated here.
export function battleStatusLabels(unit,battle) {
    return [
        ...unit.standingWards.filter(w=>w.rounds>0).map(w=>`狂风印记 ${battle.resolved.global.stormChargingWardIds.indexOf(w.id)+1}阶 · ${w.rounds}回合`),
        ...unit.charms.filter(id=>id>0).map(id=>battle.resolved.charms[id]?.desc),
        ...unit.wards.filter(w=>w.id>0).map(w=>battle.resolved.wards[w.id]?.desc),
        unit.dots.length?'持续伤害':'',unit.hots.length?'持续治疗':'',unit.stunned?'眩晕':'',
    ].filter(Boolean);
}

export function createBattleRoster(battle,side,{heroId,canTarget,target,el,button,schoolNames}) {
    const roster=el('div',`battle-roster roster-${side}`);
    roster.setAttribute('aria-label',side==='far'?'敌方队伍状态':'我方队伍状态');
    const entries=[];
    for(const unit of battle.sides[side]){
        const self=unit.id===heroId;
        const school=schoolNames[unit.school]?unit.school:'balance',icon=el('canvas','combatant-school');
        icon.width=48;icon.height=48;icon.title=schoolNames[school]||'平衡';
        icon.setAttribute('role','img');icon.setAttribute('aria-label',icon.title);
        const context=icon.getContext('2d');
        if(context)drawSchoolIcon(context,school,24,24,36);
        const heading=el('div','combatant-heading',icon,el('strong','',unit.name),el('small','',self?'自己':`Lv.${unit.level}`));
        const fill=el('i',''),health=el('div','combatant-health',fill,el('span',''));
        const pips=el('div','combatant-pips');
        pips.setAttribute('aria-label',`普通魔力 ${unit.pips.normal}，超级魔力 ${unit.pips.power}`);
        for(const [kind,count] of [['normal',unit.pips.normal],['power',unit.pips.power]])for(let i=0;i<count;i++)pips.append(el('i',`pip-${kind}`));
        if(!pips.children.length)pips.append(el('span','','暂无魔力'));
        const labels=battleStatusLabels(unit,battle),status=el('div','combatant-effects',labels.join(' · '));
        status.title=labels.join('\n');
        const node=button([heading,health,pips,...(labels.length?[status]:[])],()=>target(unit.id),`combatant-status${self?' is-self':''}${canTarget(unit)?' is-targetable':''}`);
        node.disabled=!canTarget(unit);node.title=[unit.name,`等级 ${unit.level}`,pips.getAttribute('aria-label'),...labels].join('\n');
        roster.append(node);entries.push({unit,node,fill,value:health.lastChild,lastHp:null});
    }
    return {roster,entries};
}

export function updateBattleRoster(entries,presentation) {
    for(const row of entries||[]){
        const hp=presentation?.hp?.[row.unit.id]??row.unit.hp;
        if(row.lastHp===hp)continue;
        row.lastHp=hp;row.fill.style.width=`${Math.max(0,Math.min(100,hp/row.unit.maxHp*100))}%`;
        row.value.textContent=`${Math.max(0,Math.floor(hp))} / ${row.unit.maxHp}`;
        row.node.classList.toggle('is-defeated',hp<=0);
        row.node.setAttribute('aria-label',`${row.unit.name}，生命 ${row.value.textContent}${hp<=0?'，已倒下':''}`);
    }
}
