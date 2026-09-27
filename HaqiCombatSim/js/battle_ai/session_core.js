import {ReasoningBot} from './policy_core.js';
import {reviewBattle,explainResult} from './review_core.js';
import {cardSemantics} from './haqi_adapter_core.js';
// Local transient telemetry. Never part of a cloud progress file.
export class BattleReviewSession {
    constructor(){this.frames=[];this.decisions=[];this.bot=new ReasoningBot({difficulty:'expert'});}
    analyze(arena,unit){return this.bot.analyze(arena,unit);}
    record(arena,analysis,action){
        if(!this.opening)this.opening={mode:arena.mode,near:arena.sides.near.map(u=>({id:u.id,maxHp:u.maxHp,deckCapacity:u.deckCapacity,deck:structuredClone(u.deckSpec||[])}))};
        const strength=side=>arena.sides[side].reduce((sum,u)=>sum+Math.max(0,u.hp),0);
        const pressure=side=>arena.events.filter(e=>e.type==='damage'&&arena.unitsById[e.caster]?.side===side).reduce((sum,e)=>sum+e.amount,0);
        this.frames.push({turn:arena.turn,nearStrength:strength('near'),farStrength:strength('far'),nearPressure:pressure('near'),farPressure:pressure('far')});
        this.decisions.push({turn:arena.turn,analysis,action:structuredClone(action)});
        // Same maximum as ordinary battle limits; protect tooling from unbounded input.
        if(this.frames.length>200)this.frames.shift();if(this.decisions.length>200)this.decisions.shift();
    }
    review(arena,side='near'){
        const evidence=[],own=id=>arena.unitsById[id]?.side===side;
        const indices=predicate=>arena.events.flatMap((event,index)=>predicate(event)?[index]:[]);
        const opening=this.opening?.near||[];
        const roles=new Set(opening.flatMap(u=>u.deck.flatMap(row=>{const card=arena.resolved.cards[row.key];return card?cardSemantics(card,arena.resolved).roles:[];})));
        for(const index of indices(e=>['remove_ward','steal_ward'].includes(e.type)&&own(e.caster))){
            const removal=arena.events[index],follow=arena.events.findIndex((e,i)=>i>index&&e.type==='damage'&&e.target===removal.target&&own(e.caster)&&e.amount>0&&e.turn-removal.turn<=2);
            if(follow>=0){evidence.push({kind:'highlight',verified:true,eventIndices:[index,follow],text:'这次先破盾、再进攻的衔接很漂亮。'});break;}
        }
        const dispels=indices(e=>e.type==='fizzle'&&e.reason==='dispel'&&own(e.caster));
        if(dispels.length>=2&&!roles.has('cleanse'))evidence.push({kind:'diagnosis',category:'deck',verified:true,eventIndices:dispels,priority:0,text:'本场多次被“之敌”阻止施法，现有卡包缺少净化手段；可先检查已有净化牌或用低成本同系牌处理干扰。'});
        const empty=indices(e=>e.type==='pass'&&['no_cards','deck_empty'].includes(e.reason)&&own(e.caster));
        if(empty.length>=2)evidence.push({kind:'diagnosis',category:'capacity',verified:true,eventIndices:empty,priority:1,text:'本场多次没有可出手牌。先检查弃牌和有效卡数量；若口袋确实限制了必要卡牌，再考虑更大容量，单纯加牌不一定更好。'});
        const dots=indices(e=>e.type==='dot'&&e.amount>0&&own(e.target));
        if(dots.length>=3&&!roles.has('cleanse'))evidence.push({kind:'diagnosis',category:'deck',verified:true,eventIndices:dots,priority:0,text:'对手持续伤害多次生效，现有卡包缺少净化；可以在已有卡牌中寻找解除持续伤害的手段。'});
        const deaths=indices(e=>e.type==='damage'&&own(e.target)&&arena.unitsById[e.target]?.hp<=0);
        const heavy=indices(e=>e.type==='damage'&&own(e.target)&&e.amount>=(arena.unitsById[e.target]?.maxHp||Infinity)*0.5);
        if(arena.winner!==side&&heavy.length>=2)evidence.push({kind:'diagnosis',category:'attributes',verified:true,eventIndices:heavy,priority:2,text:'本场多次单次受伤达到最大生命的一半。可以检查生命与对应学系抗性，也应比较护盾或治疗配合；这不代表必须升级才能获胜。'});
        if(arena.winner!==side&&this.opening?.mode==='pve'&&opening.length<4&&deaths.length)evidence.push({kind:'diagnosis',category:'formation',verified:true,eventIndices:deaths,priority:1,text:'本场我方未满四个战斗位置。可以检查当前模式允许的队友或宠物编队，优先补足治疗、防护或破盾能力。'});
        const report=reviewBattle({winner:arena.winner,side,frames:this.frames,decisions:this.decisions,events:arena.events,settings:arena.resolved.battleAI,evidence});
        return {...report,presentation:explainResult(report,{seed:arena.seed})};
    }
}
