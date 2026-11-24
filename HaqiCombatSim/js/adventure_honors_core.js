import {TACTICS_CHALLENGES} from './tactics_challenge_core.js';
// Honors derive from persisted achievements; no currency or simulated rankings.
const rules=[
 {id:'forest-supplies',title:'营地补给员',source:'辨认补给、送达便签，再完成巡夜灯实战并向茜茜汇报。',earned:s=>s.forestCommission?.phase==='done'},
 {id:'combo',title:'战术学徒',source:'在正式胜利中，用强化与陷阱增强同一击。',earned:s=>s.tacticsRecord?.combo>0},
 {id:'guardCombo',title:'守护有方',source:'在正式胜利中，用虚弱与护盾共同削弱同一击。',earned:s=>s.tacticsRecord?.guardCombo>0},
 {id:'teamCombo',title:'合击先锋',source:'在多人阵容的正式胜利中，完成强化与陷阱的组合。',earned:s=>s.tacticsRecord?.teamCombo>0},
 {id:'journey:first-watch',title:'晨光守望者',source:'完整通关精英副本「晨雾中的巡夜灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:first-watch']?.clears>0},
 {id:'journey:lost-spark',title:'星火寻回者',source:'完整通关精英副本「走失的火种」。',earned:s=>s.dungeonChallengeRecords?.['journey:lost-spark']?.clears>0},
 {id:'journey:ember-night',title:'余烬领队',source:'完整通关精英副本「篝火守夜人」。',earned:s=>s.dungeonChallengeRecords?.['journey:ember-night']?.clears>0},
 {id:'hanzi-restorer',title:'字源守护者',source:'找回字源岛全部六段生活文字故事，让路牌、水渠、明灯与庆典重新亮起。',earned:s=>!!s.quests?.[873105]?.claimed},
 {id:'journey:hanzi:stele-trial',title:'守碑传薪人',source:'完整通关字源岛精英试炼「字源守碑试炼」。',earned:s=>s.dungeonChallengeRecords?.['journey:hanzi:stele-trial']?.clears>0},
 {id:'journey:vault-lamp',title:'宝库寻光者',source:'完整通关哈奇岛精英副本「宝库里的求救灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:vault-lamp']?.clears>0},
 {id:'journey:frozen-letter',title:'破冰信使',source:'完整通关寒冰岛精英副本「冰封的回信」。',earned:s=>s.dungeonChallengeRecords?.['journey:frozen-letter']?.clears>0},
 {id:'journey:sand-echo',title:'沙海聆听者',source:'完整通关沙漠岛精英副本「沙海回声」。',earned:s=>s.dungeonChallengeRecords?.['journey:sand-echo']?.clears>0},
 {id:'journey:night-promise',title:'夜约守望者',source:'完整通关幽暗岛精英副本「梦魇尽头的约定」。',earned:s=>s.dungeonChallengeRecords?.['journey:night-promise']?.clears>0},
 {id:'journey:tide:elite-1',title:'潮灯引航者',source:'完整通关潮汐岛精英秘境「失声的潮灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:tide:elite-1']?.clears>0},
 {id:'journey:float:elite-1',title:'双图测绘师',source:'完整通关浮岸岛精英秘境「两岸的旧测量台」。',earned:s=>s.dungeonChallengeRecords?.['journey:float:elite-1']?.clears>0},
 {id:'journey:sail:elite-1',title:'归帆掌舵人',source:'完整通关风帆岛精英秘境「只准欢呼的档案室」。',earned:s=>s.dungeonChallengeRecords?.['journey:sail:elite-1']?.clears>0},
 {id:'tide-story',title:'潮灯寄信人',source:'完成潮汐岛主线故事「没有送到的回答」。',earned:s=>!!s.quests?.[870011]?.claimed},
 {id:'float-story',title:'双图共绘者',source:'完成浮岸岛主线故事「两张图都是真的」。',earned:s=>!!s.quests?.[870111]?.claimed},
 {id:'sail-story',title:'白帆归航者',source:'完成风帆岛主线故事「庆典前的求救」。',earned:s=>!!s.quests?.[870211]?.claimed},
 {id:'tower-climber-20',title:'高塔登阶者',source:'在任意岛屿试炼塔中突破第 20 层。',earned:s=>Object.values(s.towerRecords||{}).some(r=>(r?.floor||0)>=20)},
 {id:'tower-summit-late',title:'群岛试炼登顶者',source:'登顶任意一座 30 层及以上的中后期试炼塔。',earned:s=>[['journey:tower-fire',30],['journey:tower-ice',50],['journey:tower-desert',70],['journey:tower-dark',100],['journey:tide:tower',60],['journey:float:tower',80],['journey:sail:tower',100]].some(([id,top])=>(s.towerRecords?.[id]?.floor||0)>=top)},
 ...TACTICS_CHALLENGES.map(row=>({id:'tactical:'+row.id,title:row.honor,source:'首次战胜'+row.title+'。',earned:s=>s.tacticsChallenges?.completed?.[row.id]?.wins>0})),
];
export function adventureHonors(save){return rules.map(({earned,...row})=>({...row,earned:earned(save)}));}
export function activeAdventureHonor(save){
 const earned=adventureHonors(save).filter(row=>row.earned);
 return earned.find(row=>row.id==='tactical:'+save.tacticsChallenges?.equipped)||earned.at(-1)||null;
}
export function dungeonHonorTitle(id){return rules.find(row=>row.id===id)?.title||null;}
