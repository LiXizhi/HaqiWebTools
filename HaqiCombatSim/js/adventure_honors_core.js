// Honors derive from persisted achievements; no currency or simulated rankings.
const rules=[
 {id:'forest-supplies',title:'营地补给员',source:'辨认补给、送达便签，再完成巡夜灯实战并向茜茜汇报。',earned:s=>s.forestCommission?.phase==='done'},
 {id:'combo',title:'战术学徒',source:'在正式胜利中，用强化与陷阱增强同一击。',earned:s=>s.tacticsRecord?.combo>0},
 {id:'guardCombo',title:'守护有方',source:'在正式胜利中，用虚弱与护盾共同削弱同一击。',earned:s=>s.tacticsRecord?.guardCombo>0},
 {id:'teamCombo',title:'合击先锋',source:'在多人阵容的正式胜利中，完成强化与陷阱的组合。',earned:s=>s.tacticsRecord?.teamCombo>0},
 {id:'journey:first-watch',title:'晨光守望者',source:'完整通关精英副本「晨雾中的巡夜灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:first-watch']?.clears>0},
 {id:'journey:lost-spark',title:'星火寻回者',source:'完整通关精英副本「走失的火种」。',earned:s=>s.dungeonChallengeRecords?.['journey:lost-spark']?.clears>0},
 {id:'journey:ember-night',title:'余烬领队',source:'完整通关精英副本「篝火守夜人」。',earned:s=>s.dungeonChallengeRecords?.['journey:ember-night']?.clears>0},
];
export function adventureHonors(save){return rules.map(({earned,...row})=>({...row,earned:earned(save)}));}
export function activeAdventureHonor(save){return adventureHonors(save).filter(row=>row.earned).at(-1)||null;}
export function dungeonHonorTitle(id){return rules.find(row=>row.id===id)?.title||null;}
