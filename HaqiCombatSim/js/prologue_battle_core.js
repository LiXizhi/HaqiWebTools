// prologue_battle_core.js — battles for the prologue 《失落的光》.
// Pure rules: real kids cards through combat_arena_core; no DOM. Unit HP and startup pips are
// unit configuration (like monster templates); card numbers and formulas are never changed.
import {createArena,startCombat,playTurn,castableCards,validTargets} from './combat_arena_core.js';
import {defaultParams,resolveParams} from './combat_params_core.js';
import {SimpleBot} from './combat_policy_core.js';
import {installWordCards,prepareWordHand} from './word_cards_core.js';
import {isAlive,cardsInHand,prepareCard} from './combat_unit_core.js';

export const SCHOOLS=['fire','ice','storm','life','death'];
const CAP={fire:'Fire',ice:'Ice',storm:'Storm',life:'Life',death:'Death'};
// Display looks reuse existing hero atlases; names come from the script speakers.
export const MASTER_LOOKS={
    'master-fire':{school:'fire',appearance:'girl',bodyId:'female2',headId:'copper-girl'},
    'master-ice':{school:'ice',appearance:'boy',bodyId:'male4',headId:'sun-boy'},
    'master-storm':{school:'storm',appearance:'girl',bodyId:'female6',headId:'onyx-girl'},
    'master-life':{school:'life',appearance:'boy',bodyId:'male3',headId:'jade-boy'},
};
export const MASTERS_ORDER=['master-fire','hero','master-storm','master-life'];
export const MASTER_SPEAKER_ID={
    'master-fire':'master-fire',
    hero:'master-ice',
    'master-storm':'master-storm',
    'master-life':'master-life',
};
// Exact 3 beginner-guide showcase skills per school (matching TUTORIAL_SKILLS in adventure_creation_preview.js).
export const MASTER_SHOWCASE_CHOICES={
    'master-fire':['Fire_AreaAttackWithDOT_Level4','Fire_DOTAttack_LevelX','Fire_DOTAttackWithSplash_Level6'],
    hero:['Ice_SingleAttack_Level6','Ice_AreaAbsorb_LevelX','Ice_ReflectionShield'],
    'master-storm':['Storm_SingleAttack_Level6','Storm_AreaAttack_LevelX','Storm_SingleAttack_Level4'],
    'master-life':['Life_SingleHealWithHOT_Level5','Life_SingleAttack_Level4','Life_SingleAttack_Level6'],
};
export const MASTER_ATTACK_CHOICES=MASTER_SHOWCASE_CHOICES;
export const DARK_LORD_CARDS=['Death_AreaAttackWithLifeTap_Level7'];
export const MASTERS_SEED=2027;
export const FINALE_SEED=2027;
export const DARK_LORD_HP=1800;
export const IMP_HP=900;
const HAND_SIZE=8;

const resolvedCache=new WeakMap();
function resolved(dataset,params){
    const p=params||defaultParams('kids');
    let byParams=resolvedCache.get(dataset);
    if(!byParams){byParams=new WeakMap();resolvedCache.set(dataset,byParams);}
    let r=byParams.get(p);
    if(!r){r=resolveParams(dataset,p);byParams.set(p,r);}
    return r;
}
const deck=rows=>rows.map(([key,count])=>({key,count}));
const clone=arena=>{const {onEvent,resolved,...state}=arena;return {...JSON.parse(JSON.stringify(state)),resolved};};
function profile(id,names){return {...MASTER_LOOKS[id],name:names?.[id]||id};}

/** Plays one side's turn and records presentation frames. When `finishAfterCaster` is set, enemies survive at >=1 HP until the final wizard casts, then fall. */
function capture(arena,picks,{finishAfterCaster=null}={}){
    const frames=[],before=clone(arena);
    arena.onEvent=event=>{
        if(finishAfterCaster&&event.type==='damage'&&event.caster!==finishAfterCaster){
            for(const u of arena.sides.far)if(u.hp<=0)u.hp=1;
        }
        if(finishAfterCaster&&(event.type==='damage'||event.type==='heal')&&event.caster===finishAfterCaster){
            for(const u of arena.sides.far)u.hp=0;
        }
        if(['cast','damage','heal','fizzle','pass','combat_end'].includes(event.type)){
            frames.push({arena:clone(arena),event:{...event}});
        }
    };
    try{playTurn(arena,picks);}finally{delete arena.onEvent;}
    return {before,picks:structuredClone(picks),frames,after:clone(arena)};
}
function pickFor(arena,unitId,raw,defaultTargetId){
    const unit=arena.unitsById[unitId],castable=castableCards(arena,unit);
    const seq=typeof raw==='object'&&raw!==null&&Number.isInteger(raw.seq)?raw.seq:null;
    const keys=typeof raw==='string'?[raw]:(raw?.key?[raw.key]:[].concat(raw||[]));
    const card=(seq!==null&&castable.find(c=>c.seq===seq))||keys.map(key=>castable.find(c=>c.key===key)).find(Boolean);
    if(!card)throw Error(`序章战斗卡牌不可施放：${unitId} ${JSON.stringify(raw)}`);
    const targets=validTargets(arena,unit,card.card);
    const preferred=(typeof raw==='object'&&raw?.targetId)||defaultTargetId;
    const target=targets.find(t=>t.id===preferred)||targets[0];
    if(!target)throw Error(`序章战斗没有可选目标：${card.key}`);
    return {seq:card.seq,key:card.key,targetId:target.id};
}

// Each wizard carries two copies of each of their 3 showcase skills so all 3 are in the opening hand.
const MASTER_DECKS=Object.fromEntries(
    Object.entries(MASTER_SHOWCASE_CHOICES).map(([id,[a,b,c]])=>[id,[[a,2],[b,2],[c,2]]]),
);
const DARK_OPENING=[['dark-lord','Death_AreaAttackWithLifeTap_Level7','hero']];
const IMP_OPENING=[
    ['imp-1','Death_SingleAttack_Level0_50','master-fire'],
    ['imp-2','Death_SingleAttack_Level0_50','hero'],
];

function createFourMasters(names){
    const nameOf=id=>names?.[MASTER_SPEAKER_ID[id]||id]||id;
    return MASTERS_ORDER.map(id=>({
        id,
        name:nameOf(id),
        school:MASTER_LOOKS[MASTER_SPEAKER_ID[id]].school,
        level:50,
        stats:{startupNormal:6,accuracyPct:45},
        deck:deck(MASTER_DECKS[id]),
    }));
}

/** Act 1: four masters vs the death-school Dark Lord. The player picks one of the 3 showcase skills for each wizard. */
export function createMastersArena(dataset,params,{names,seed=MASTERS_SEED}={}){
    const R=resolved(dataset,params);
    const near=createFourMasters(names);
    const far=[{
        id:'dark-lord',
        name:names?.['dark-lord']||'dark-lord',
        school:'death',
        level:50,
        stats:{startupNormal:7,accuracyPct:35},
        deck:deck([['Death_AreaAttackWithLifeTap_Level7',4],['Death_SingleAttackWithLifeTap_Level2',4]]),
    }];
    const arena=createArena({resolved:R,near,far,seed,firstSide:'far',keepEvents:true});
    for(const unit of near)arena.unitsById[unit.id].arenaProfile=profile(MASTER_SPEAKER_ID[unit.id],names);
    const lord=arena.unitsById['dark-lord'];lord.maxHp=DARK_LORD_HP;lord.hp=DARK_LORD_HP;
    startCombat(arena);
    for(const unit of arena.sides.near)prepareCard(unit,HAND_SIZE);
    return arena;
}
/** Returns the 3 showcase skills for `unitId` plus the forged word card when installed on that unit. */
export function wizardAttackHand(arena,unitId){
    const unit=arena.unitsById[unitId];
    if(!unit)throw Error(`序章未知大师：${unitId}`);
    const inHand=cardsInHand(unit);
    const allowed=MASTER_SHOWCASE_CHOICES[unitId]||[];
    const showcase=allowed.map(key=>inHand.find(c=>c.key===key&&!unit.wordCards?.[c.seq])).filter(Boolean).map(({seq,key})=>({seq,key}));
    const word=inHand.filter(c=>unit.wordCards?.[c.seq]).map(({seq,key})=>({seq,key,wordCard:true}));
    return [...showcase,...word];
}
/** Plays the Dark Lord's opening Death AoE (if not yet played) and the four masters' chosen showcase skills. */
export function mastersResolve(arena,picks={}){
    const groups=[];
    if(!arena.finished&&arena.currentSide==='far'){
        const farPicks=Object.fromEntries(DARK_OPENING.map(([id,key,target])=>[id,pickFor(arena,id,key,target)]));
        groups.push(capture(arena,farPicks));
    }
    if(!arena.finished&&arena.currentSide==='near'){
        const nearPicks={};
        for(const id of MASTERS_ORDER){
            if(!isAlive(arena.unitsById[id]))continue;
            const raw=picks?.[id];
            const key=typeof raw==='string'?raw:raw?.key||MASTER_SHOWCASE_CHOICES[id][0];
            if(!MASTER_SHOWCASE_CHOICES[id].includes(key))throw Error(`序章关键卡牌无效：${id} ${key}`);
            nearPicks[id]=pickFor(arena,id,raw||key,'dark-lord');
        }
        groups.push(capture(arena,nearPicks,{finishAfterCaster:MASTERS_ORDER.at(-1)}));
    }
    return groups;
}

export function finaleDeck(school){
    if(!SCHOOLS.includes(school))throw Error('序章学系无效');
    const S=CAP[school];
    return [[`${S}_SingleAttack_Level0_70`,5],[`${S}_SingleAttack_Level0_60`,5]];
}
export function wordCardRow(rows,target){
    const id=target==='zh-CN'?'zh:guang':'en:sun';
    const row=rows.find(r=>r.id===id);if(!row)throw Error(`缺少文字卡：${id}`);
    return row;
}
/** Act 4: 4v2 rematch — the four masters vs two Shadow Imps, with each wizard holding their 3 showcase skills + the forged 光 word card. */
export function createFinaleArena(dataset,params,{names={},wordCard,seed=FINALE_SEED}={}){
    const R=resolved(dataset,params);
    const near=createFourMasters(names);
    const imp=i=>({
        id:`imp-${i}`,
        name:names.imp||'imp',
        school:'death',
        level:20,
        stats:{startupNormal:4,accuracyPct:35},
        deck:deck([['Death_SingleAttack_Level0_50',6]]),
    });
    const arena=createArena({resolved:R,near,far:[imp(1),imp(2)],seed,firstSide:'far',keepEvents:true});
    for(const unit of near)arena.unitsById[unit.id].arenaProfile=profile(MASTER_SPEAKER_ID[unit.id],names);
    for(const unit of arena.sides.far){unit.maxHp=IMP_HP;unit.hp=IMP_HP;}
    startCombat(arena);
    for(const unit of arena.sides.near){
        prepareCard(unit,HAND_SIZE);
        if(wordCard){
            installWordCards(unit,{version:2,cards:[wordCard],activated:[]},R.cards);
            for(const row of Object.values(unit.wordCards))row.activated=true;
            prepareWordHand(unit,HAND_SIZE);
        }
    }
    return arena;
}
/** Resolves the 4v2 finale: the two Shadow Imps open, then all four masters cast their chosen card (3 showcase skills or the 光 word card). */
export function finaleResolve(arena,picks={}){
    const groups=[];
    if(!arena.finished&&arena.currentSide==='far'){
        const farPicks=Object.fromEntries(IMP_OPENING.map(([id,key,target])=>[id,pickFor(arena,id,key,target)]));
        groups.push(capture(arena,farPicks));
    }
    if(!arena.finished&&arena.currentSide==='near'){
        const nearPicks={};
        MASTERS_ORDER.forEach((id,index)=>{
            const unit=arena.unitsById[id];
            if(!isAlive(unit))return;
            const hand=wizardAttackHand(arena,id);
            const defaultCard=id===MASTERS_ORDER.at(-1)?(hand.find(c=>c.wordCard)||hand[0]):hand[0];
            const raw=picks?.[id]||defaultCard;
            const defaultEnemy=index%2===0?'imp-1':'imp-2';
            nearPicks[id]=pickFor(arena,id,raw,defaultEnemy);
        });
        groups.push(capture(arena,nearPicks,{finishAfterCaster:MASTERS_ORDER.at(-1)}));
    }
    return groups;
}
export function finaleTurn(arena,picks){return finaleResolve(arena,picks);}
export function autoHeroPick(arena,unitId=MASTERS_ORDER[0]){
    const hand=wizardAttackHand(arena,unitId);
    return hand.find(c=>c.wordCard)||hand[0]||new SimpleBot().pick(arena,arena.unitsById[unitId]);
}
export function wordCardInHand(arena,unitId=MASTERS_ORDER[0]){
    const unit=arena.unitsById[unitId];
    return Object.keys(unit?.wordCards||{}).map(Number).find(seq=>unit.deckMap[seq]===1)??null;
}
