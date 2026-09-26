import {drawSchoolIcon} from './card_renderer.js';
import {battleStatusEffects} from './view_adventure_overhead_status.js';

// Corner rosters share the arena's target callbacks; no battle state is mutated here.
export function battleStatusLabels(unit,battle) {
    return battleStatusEffects(unit,battle).map(effect=>effect.desc);
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
        const node=button([heading,health,pips,status],()=>target(unit.id),`combatant-status${self?' is-self':''}${canTarget(unit)?' is-targetable':''}`);
        node.disabled=!canTarget(unit);node.title=[unit.name,`等级 ${unit.level}`,pips.getAttribute('aria-label'),...labels].join('\n');
        roster.append(node);entries.push({unit,node,fill,status,battle,manaLabel:pips.getAttribute('aria-label'),value:health.lastChild,lastHp:null});
    }
    return {roster,entries};
}

export function updateBattleRoster(entries,presentation) {
    for(const row of entries||[]){
        if(row.status){
            const effects=presentation?.status?.[row.unit.id];
            const labels=effects?effects.flatMap(effect=>effect.descriptions):battleStatusLabels(row.unit,row.battle);
            const description=labels.join(' · ');
            if(row.status.textContent!==description)row.status.textContent=description;
            row.status.hidden=!labels.length;row.status.title=labels.join('\n');
            row.node.title=[row.unit.name,row.unit.level?`等级 ${row.unit.level}`:'',row.manaLabel,...labels].filter(Boolean).join('\n');
        }
        const hp=presentation?.hp?.[row.unit.id]??row.unit.hp;
        if(row.lastHp===hp)continue;
        row.lastHp=hp;row.fill.style.width=`${Math.max(0,Math.min(100,hp/row.unit.maxHp*100))}%`;
        row.value.textContent=`${Math.max(0,Math.floor(hp))} / ${row.unit.maxHp}`;
        row.node.classList.toggle('is-defeated',hp<=0);
        row.node.setAttribute('aria-label',`${row.unit.name}，生命 ${row.value.textContent}${hp<=0?'，已倒下':''}`);
    }
}
