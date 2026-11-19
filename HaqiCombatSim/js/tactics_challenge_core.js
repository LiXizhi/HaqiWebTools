import {createPveBattle} from './combat_pve_core.js';
export const TACTICS_CHALLENGES=[
 {id:'normal',title:'巡夜试锋',kind:'普通',rounds:'3–5',size:1,
  hp:[320],honor:'巡夜新星',
  summary:'巡夜怪先强化，下一回合挥出单体重击。它只有320点生命。',
  strategies:['趁蓄力布置强化或陷阱，算准伤害后抢先击倒它。','留一张护盾或虚弱挡重击，接住后用反击强化收尾。']},
 {id:'elite',title:'双人火种阵',kind:'精英',rounds:'5–8',size:2,
  hp:[420,240],honor:'破阵搭档',
  summary:'主攻蓄力后会挥出重击；守护负责防护与治疗，茜茜与你并肩。',
  strategies:['先集火守护位切断保护；看到主攻蓄力，留好护盾接下重击。','先用小招破盾；重击前用护盾或虚弱接招，获得反击强化后集中进攻。']},
 {id:'boss',title:'余烬守夜者',kind:'首领',rounds:'8–12',size:1,
  hp:[900],honor:'余烬守望者',
  summary:'首领半血后改变战法。转换阶段不会额外出手。',
  strategies:['重击前护盾接招，拿到反击强化；小招破盾后进攻，血量下降及时治疗。','用虚弱削弱整段灼烧，再治疗反击；火系续上灼烧，其他学派抓恢复回合进攻。']}
];
export const TACTICS_SCHOOLS={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
export const tacticsChallengeById=id=>TACTICS_CHALLENGES.find(row=>row.id===id);
export const TACTICS_LOADOUTS={balanced:'均衡 · 20张',burst:'爆发 · 20张',guard:'防守 · 20张',attack:'纯攻 · 12张'};
const LOADOUT_COUNTS={
  balanced:[2,3,4,3,2,2,2,2],
  burst:[2,3,4,4,3,1,1,2],
  guard:[2,3,3,2,2,3,3,2],
  attack:[4,4,4,0,0,0,0,0]
 };
export function tacticsLoadoutCounts(loadout='balanced'){
 if(typeof loadout!=='string'||!Object.hasOwn(LOADOUT_COUNTS,loadout))throw Error('挑战配卡无效');
 return [...LOADOUT_COUNTS[loadout]];
}
export function tacticsLoanDeck(school='fire',loadout='balanced'){
 if(typeof loadout!=='string'||!Object.hasOwn(TACTICS_LOADOUTS,loadout))throw Error('挑战配卡无效');
 if(typeof school!=='string'||!Object.hasOwn(TACTICS_SCHOOLS,school))throw Error('挑战学派无效');
 const counts=tacticsLoadoutCounts(loadout);
 const s=school[0].toUpperCase()+school.slice(1);
 const attacks=school==='fire'
  ?['Fire_SingleAttackWithDOT_Level1','Fire_SingleAttackWithDOT_Level2']
  :school==='death'
   ?['Death_SingleAttack_Level1','Death_SingleAttackWithLifeTap_Level2']
   :[`${s}_SingleAttack_Level1`,`${s}_SingleAttack_Level2`];
 return [`${s}_SingleAttack_Level0_45`,...attacks,`${s}_${s}DamageBlade`,`${s}_${s}DamageTrap`,'Ice_GlobalShield','Death_AreaDamageWeakness','Life_SingleHeal_Level0']
  .map((key,index)=>({key,count:counts[index]}))
  .filter(row=>row.count>0);
}
export function createTacticsChallenge(dataset,content,{id='normal',school='fire',loadout='balanced',seed=1,name='冒险者'}={}){
 const encounter=tacticsChallengeById(id);
 if(!encounter)throw Error('挑战不存在');
 const player={id:'hero',name,school,level:5,slot:0,
  deck:tacticsLoanDeck(school,loadout),
  deckCapacity:30,deckEachCapacity:4,stats:{hpFlat:150}};
 const party=[player];
 if(encounter.size===2)party.push({id:'challenge-support',name:'茜茜',school:'life',level:5,slot:1,
  deck:['Fire_SingleAttack_Level0_45','Life_SingleHeal_Level0','Life_SingleHealWithHOT_Level1','Life_SingleAttack_Level0_45'].map(key=>({key,count:3})),
  deckCapacity:30,deckEachCapacity:4,stats:{hpFlat:150}});
 const original=content.monsters[content.encounters.find(row=>row.id==='fire-scout')?.monsterId];
 if(!original)throw Error('挑战怪物资料未准备好');
 const monsters=encounter.hp.map((hp,i)=>({...structuredClone(original),name:i===0?(id==='elite'?'火种先锋':encounter.title):'火种守护者',school:'fire',level:5,hp,maxHp:hp,
  attributes:id!=='boss'&&i===0?{startup_pips_normal:1}:{},genes:[],sequences:[],cardsets:{},
  pool:[{key:'Fire_SingleAttack_Level0_45',weight:1},{key:id!=='boss'&&i===0?'Fire_Pet_SingleAttack_FireRockyOgresDominance':'Fire_SingleAttackWithDOT_Level2',weight:1}],
  xp:0,coins:0,dungeonTactic:{version:1,role:i?'warden':'charger'}}));
 const battle=createPveBattle({dataset,player,party,monsters,seed,
  tacticalEncounter:{id,version:1,phaseThreshold:0.5,handSize:6,focusFreeAttack:false,preparationBoost:{normal:65,elite:100,boss:75}[id]}});
 if(party.length>1)battle.sides.near[1].arenaProfile={appearance:'girl',bodyId:'female10',headId:'wave-girl',name:'茜茜',school:'life',mountId:null};
 battle.tacticsField={id,title:encounter.title,kind:encounter.kind,size:encounter.size,challenge:true,school,loadout,rounds:encounter.rounds,honor:encounter.honor,
  rewardText:`首次胜利获得称号「${encounter.honor}」；重复挑战不发经验、金币。`,
  summary:encounter.summary};
 return battle;
}
export function recordTacticsChallengeVictory(save,battle){
 const row=battle?.tacticsField?.challenge&&tacticsChallengeById(battle.tacticsField.id);
 if(!row||!battle.finished||battle.winner!=='near')return false;
 save.tacticsChallenges??={version:1,completed:{}};
 const previous=save.tacticsChallenges.completed[row.id];
 save.tacticsChallenges.completed[row.id]={wins:Math.min(9999,(previous?.wins||0)+1),bestRounds:Math.min(previous?.bestRounds||9999,Math.max(1,battle.completedDecisions??(battle.turn-1)))};
 return true;
}
export function validateTacticsChallenges(save){
 const value=save.tacticsChallenges;
 if(value===undefined)return;
 if(value?.version!==1||!value.completed||typeof value.completed!=='object'||Array.isArray(value.completed))throw Error('挑战记录无效');
 for(const [id,row]of Object.entries(value.completed)){
  if(!tacticsChallengeById(id)||!row||![row.wins,row.bestRounds].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=9999))throw Error('挑战记录无效');
 }
 if(value.equipped!==undefined&&(!tacticsChallengeById(value.equipped)||!value.completed[value.equipped]?.wins))throw Error('尚未获得这个巡夜称号');
}
export function equipTacticsHonor(save,id){
 const record=save.tacticsChallenges;
 if(id===null){if(record)delete record.equipped;return;}
 if(!tacticsChallengeById(id)||!record?.completed?.[id]?.wins)throw Error('尚未获得这个巡夜称号');
 record.equipped=id;
}
