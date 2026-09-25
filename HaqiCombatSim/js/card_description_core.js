// Presentation only. Parameters and effect dictionaries come from the battle's resolved data.
// Translation is injected by the view; this module stays independent of browser locale state.
import {cardTargetKind} from './combat_cards_core.js';
import {inferTargetKind} from './combat_params_core.js';
const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡',all:'任意系'};
const list=value=>String(value??'').split(',').map(s=>s.trim()).filter(Boolean);

export function describeCard(card,{dataset={},cooldown,translate=value=>value}={}) {
    const t=(pattern,vars={})=>String(translate(pattern)).replace(/\{(\w+)\}/g,(token,key)=>key in vars?translate(String(vars[key])):token);
    const schoolName=value=>t(schools[value]||'魔法');
    const amount=value=>/^\d+p$/.test(String(value))?t('{amount}×魔力',{amount:String(value).slice(0,-1)}):String(value??0);
    const range=(a,b=a)=>String(a)===String(b)?amount(a):t('{min}～{max}',{min:amount(a),max:amount(b)});
    const ticks=value=>{const values=list(value);return values.every(v=>v===values[0])?t('{amount}×{rounds}回合',{amount:amount(values[0]),rounds:values.length}):values.map(amount).join(t('、'));};
    const p=card.params||{},type=card.type||'';
    const charms=dataset.charms?.charm||dataset.charms||{},wards=dataset.charms?.ward||dataset.wards||{};
    const kind=card.target||inferTargetKind(card,{charm:charms,ward:wards})||cardTargetKind(card);
    let target=t(kind==='friendly'?'自己或一名友方':kind==='self'?'自己':'一名敌人');
    if(type.startsWith('Area'))target=t(/Heal|Absorb|Cleanse|PowerPip/.test(type)?'全体友方':'全体敌人');
    if(type==='ArenaAttack')target=t('全场所有角色');
    if(type==='AreaCharm')target=t([true,'true'].includes(charms[list(p.charm??p.charms)[0]]?.positive)?'全体友方':'全体敌人');
    if(type==='AreaWard')target=t([false,'false'].includes(wards[list(p.ward??p.wards)[0]]?.positive)?'全体敌人':'全体友方');
    const summary=[],lines=[];
    let complete=['SingleAttack','AreaAttack','ArenaAttack','SingleAttackWithDOT','AreaAttackWithDOT','AreaDOTAttack','DOTAttack','DOTAttackWithHOT','SingleHeal','SingleHealWithHOT','AreaHeal','AreaHealWithHOT','AreaHealWithAbsorb','Absorb','AreaAbsorb','Charms','Wards','StandingWards','AreaCharm','AreaWard','Pass'].includes(type);
    if(type==='SingleAttackWithPercent'){
        summary.push(t('伤害为目标当前生命的 {percent}%',{percent:p.damage_percent||0}));
        lines.push(t('对{target}造成其当前生命 {percent}% 的基础伤害，另受此牌的伤害上限限制。',{target,percent:p.damage_percent||0}));
    }else if(p.damage_min!==undefined){
        const damage=range(p.damage_min,p.damage_max??p.damage_min),multiple=type==='SingleAttackWithMultipleDamage';
        summary.push(t(multiple?'每段基础 {amount}':'伤害 {amount}',{amount:damage}));
        lines.push(t('对{target}立即造成 {amount} 点{school}基础伤害。',{target,amount:damage,school:schoolName(p.damage_school||card.spellSchool)}));
        if(multiple)lines.push(t('分段攻击 {times} 次；特殊段数可能使用不同伤害。',{times:p.random_times?list(p.random_times).join(t('～')):p.times||1}));
    }
    function periodic(value,heal=false){
        const values=list(value),same=values.every(v=>v===values[0]);
        summary.push(t(heal?'持续治疗 {ticks}':'持续 {ticks}',{ticks:ticks(value)}));
        const schedule=same?t('每回合 {amount}',{amount:amount(values[0])}):t('各回合依次为 {amounts}',{amounts:values.map(amount).join(t('、'))});
        lines.push(t(heal?'为{target}附加持续治疗：{rounds} 回合，{schedule} 点基础生命值。':'对{target}附加持续伤害：{rounds} 回合，{schedule} 点基础伤害。',{target:heal&&type==='DOTAttackWithHOT'?t('自己'):target,rounds:values.length,schedule}));
    }
    if(p.dots!==undefined)periodic(p.dots);
    if(p.heal_min!==undefined){const heal=range(p.heal_min,p.heal_max??p.heal_min);summary.push(t('治疗 {amount}',{amount:heal}));lines.push(t('立即为{target}恢复 {amount} 点基础生命值。',{target,amount:heal}));}
    if(p.hots!==undefined)periodic(p.hots,true);
    if(p.absorb_pts!==undefined){
        summary.push(t('吸收 {amount}',{amount:amount(p.absorb_pts)}));
        lines.push(t('为{target}施加护盾，累计吸收 {amount} 点伤害。护盾不会恢复已经损失的生命。',{target,amount:amount(p.absorb_pts)}));
        lines.push(t('吸收就是替你承受伤害：结算到护盾的伤害先扣护盾容量，超过剩余容量的部分才扣生命；没用完的容量保留，用完后护盾消失。'));
        if(Number(p.absorb_pts)>=200)lines.push(t('例如：护盾剩余 {capacity} 点，承受一次 200 点伤害后，生命不减少，护盾还剩 {remaining} 点。',{capacity:p.absorb_pts,remaining:Number(p.absorb_pts)-200}));
    }
    for(const [key,periodicKey] of [['damage','dots'],['heal','hots']]){
        if(!['SingleAttackWithDOT','SingleHealWithHOT'].includes(type)||!list(p[periodicKey]).length)continue;
        const values=[p[`${key}_min`]??0,p[`${key}_max`]??p[`${key}_min`]??0,...list(p[periodicKey])].map(Number);
        if(values.every(Number.isFinite)){
            const total=values.slice(2).reduce((a,b)=>a+b,0);
            lines.push(t(key==='damage'?'基础总伤害：{amount} 点（即时效果与持续效果合计，并非一次生效）。':'基础总治疗：{amount} 点（即时效果与持续效果合计，并非一次生效）。',{amount:range(values[0]+total,values[1]+total)}));
        }
    }
    // processDamageAgainstWards consumes a matching prism and changes the RECEIVED school.
    // Absorption reduces capacity, whereas percentage wards modify one matching damage event.
    if(['Charms','Wards','StandingWards','AreaCharm','AreaWard'].includes(type)){
        const charm=/Charm/.test(type),ids=list(charm?p.charms??p.charm:p.wards??p.ward),table=charm?charms:wards;
        for(const id of ids){
            const effect=table[id];
            if(!effect){complete=false;continue;}
            if(effect.prism_from&&effect.prism_to){
                const from=schoolName(effect.prism_from),to=schoolName(effect.prism_to);
                summary.push(t('{from}伤害→{to}伤害',{from,to}));
                lines.push(t('给{target}放置棱镜。当该目标下一次受到{from}伤害时，将这次伤害转换为{to}伤害，并消耗棱镜；其他系伤害不会触发这个棱镜。',{target,from,to}));
                lines.push(t('转换的是目标受到的伤害，不是目标发出的攻击，也不会改变卡牌或角色的学系。转换后按新学系的抗性结算。'));
                lines.push(t('用途：如果敌人抵抗{from}、却不擅长抵抗{to}，先放棱镜，再用{from}攻击它。伤害不保证增加，仍取决于它对两系的抗性。',{from,to}));
                lines.push(t('棱镜与护盾、陷阱按后放先处理的顺序结算；搭配使用时，放置顺序会影响哪些效果触发。'));
            }else if(type==='StandingWards'){
                summary.push(t(effect.desc||'持续护盾'));
                lines.push(t('对{target}施加持续效果：{effect}，持续 {rounds} 回合。',{target,effect:t(effect.desc||'持续护盾'),rounds:p.rounds||1}));
                complete=false;
            }else if(effect.boost_damage!==undefined){
                const percent=Number(effect.boost_damage),vars={target,school:schoolName(effect.school||'all'),percent:Math.abs(percent)};
                summary.push(t(charm?(percent>=0?'下次{school}攻击 +{percent}%':'下次{school}攻击 -{percent}%'):(percent>=0?'下次受到{school}伤害 +{percent}%':'下次受到{school}伤害 -{percent}%'),vars));
                lines.push(t(charm?(percent>=0?'使{target}下一次匹配的{school}攻击伤害提高 {percent}%，触发后消耗此术。':'使{target}下一次匹配的{school}攻击伤害降低 {percent}%，触发后消耗此术。'):(percent>=0?'给{target}放置陷阱，使其下一次受到的{school}伤害提高 {percent}%，触发后陷阱消失。':'为{target}施加减伤盾，使其下一次受到的{school}伤害降低 {percent}%，触发后护盾消失。'),vars));
                if(!charm&&percent<0)lines.push(t('减伤盾按比例减少一次匹配的伤害；吸收盾则有固定容量，可以分多次扣除。'));
            }else if([true,'true'].includes(effect.stunabsorb)){
                summary.push(t('抵挡一次眩晕'));lines.push(t('为{target}抵挡下一次眩晕，触发后消耗护盾；不会吸收生命伤害。',{target}));
            }else if(effect.desc){summary.push(t(effect.desc));lines.push(t('对{target}施加：{effect}。',{target,effect:t(effect.desc)}));complete=false;}
            else complete=false;
        }
    }
    if(/LifeTap/.test(type))lines.push(t('将实际造成伤害的 {percent}% 转为自己的生命回复。',{percent:p.convert_rate||0}));
    if(/Immolate/.test(type)&&p.immolate_damage_min!==undefined)lines.push(t('施法同时对自己造成 {amount} 点基础伤害。',{amount:range(p.immolate_damage_min,p.immolate_damage_max)}));
    if(type==='ArenaAttack')lines.push(t('友方承受的直接伤害减半。'));
    if(type==='Pass'){summary.push(t('跳过本回合'));lines.push(t('跳过本回合，不施放法术。'));}
    const simple={
        SingleCleanse:()=>t('净化{target}的负面效果。',{target}),AreaCleanse:()=>t('净化全体友方的负面效果。'),
        GainPips:()=>t('为{target}增加 {count} 点普通魔力，不超过魔力上限。',{target,count:p.pips||1}),
        SingleTaunt:()=>t('嘲讽{target}，将自己对目标怪物的仇恨提高至最高仇恨并追加 {count} 点。',{target,count:p.additional_threat||0}),
        AreaTaunt:()=>t('嘲讽全体敌方怪物，逐个提高自己的仇恨并追加 {count} 点。',{count:p.additional_threat||0}),
        RemovePositiveCharm:()=>t('随机移除{target}最多 {count} 个增益术。',{target,count:p.remove_count||1}),
        RemoveNegativeCharm:()=>t('随机移除{target}最多 {count} 个减益术。',{target,count:p.remove_count||1}),
        RemovePositiveWard:()=>t('随机移除{target}最多 {count} 个正面护盾。',{target,count:p.remove_count||1}),
        StealCharm:()=>t('从{target}随机偷取最多 {count} 个增益术，转移到自己身上。',{target,count:p.steal_count||1}),
        StealWard:()=>t('从{target}随机偷取最多 {count} 个正面护盾，转移到自己身上。',{target,count:p.steal_count||1}),
    };
    if(simple[type]){const text=simple[type]();summary.push(text);lines.push(text);complete=true;}
    if(type==='CatchPet'){summary.push(t('捕捉野生宠物'));lines.push(t('尝试捕捉选中的野生宠物；成功率受符文、目标剩余生命和等级差影响，成功或失败均消耗一张符文。'));complete=true;}
    if(!complete)lines.push(t('此牌的特殊效果说明尚未完整收录，请结合战斗记录查看实际效果。'));
    const variable=card.pipcost==='X'||Number(card.pipcost)<0||Number(card.pipcost)===114;
    if(variable||Object.values(p).some(v=>/\dp(?:,|$)/.test(String(v))))lines.push(t('“×魔力”按本次施法实际计入的魔力点计算，不是固定总量；本系超级魔力每个抵 2 点，其他系抵 1 点。'));
    const fallback=/Ward|Shield|Absorb|Guardian/.test(type)?'护盾效果':/Charm/.test(type)?'增益 / 减益':/Stun|Freeze/.test(type)?'控制行动':/Pip/.test(type)?'改变魔力':/Global|Aura|Stance/.test(type)?'场地 / 姿态':'特殊魔法';
    return {summary:summary.join(t('；'))||t(fallback),lines,target,
        meta:t('{school}系 · {target} · 消耗 {cost} 点魔力 · 冷却 {rounds} 回合 · 基础命中 {accuracy}%',{school:schoolName(card.spellSchool),target,cost:variable?'X':card.pipcost??0,rounds:cooldown??p.cooldown??0,accuracy:Math.min(100,Number(card.accuracy)||0)}),
        note:t('以上为基础效果；实际伤害、治疗与命中受角色属性、目标防御及战斗状态影响。')};
}
