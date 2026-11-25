import {TACTICS_CHALLENGES} from './tactics_challenge_core.js';
import {allHanziPuzzlesSolved,midLatePuzzlesCompletedCount} from './island_puzzles_core.js';
import {steleRubbingCount} from './hanzi_stele_scroll_core.js';
import {HANZI_FORGE_RECIPES,hanziForgeCount} from './hanzi_forge_core.js';
import {fishingAlbumSummary} from './fishing_bounties_core.js';
import {campfireCountCooked} from './campfire_cooking_core.js';
import {ALL_TRILOGY_CURIOS,trilogyCurioCount} from './trilogy_curios_core.js';
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
 {id:'hanzi-puzzle-master',title:'字源匠心人',source:'完成字源岛全部六处地标的现场木牌与石碑安放。',earned:s=>allHanziPuzzlesSolved(s)},
 {id:'hanzi-stele-scholar',title:'碑林传拓人',source:'在字源岛碑林传拓册中完成至少三篇进阶象形故事描红。',earned:s=>steleRubbingCount(s)>=3},
 {id:'hanzi-alchemist',title:'会意造字师',source:'在字源合字坊中合出至少六个会意汉字，领悟象形组合之妙。',earned:s=>hanziForgeCount(s)>=6},
 {id:'hanzi-forge-master',title:'万象造字宗师',source:'点亮字源合字坊全部十二枚会意汉字图谱。',earned:s=>hanziForgeCount(s)>=HANZI_FORGE_RECIPES.length},
 {id:'journey:hanzi:stele-trial',title:'守碑传薪人',source:'完整通关字源岛精英试炼「字源守碑试炼」。',earned:s=>s.dungeonChallengeRecords?.['journey:hanzi:stele-trial']?.clears>0},
 {id:'journey:vault-lamp',title:'宝库寻光者',source:'完整通关哈奇岛精英副本「宝库里的求救灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:vault-lamp']?.clears>0},
 {id:'journey:dream-feather',title:'寻羽筑梦人',source:'完整通关哈奇岛三人秘境「梦中遗落的羽毛」。',earned:s=>s.dungeonChallengeRecords?.['journey:dream-feather']?.clears>0},
 {id:'journey:gold-bell',title:'金铃追回者',source:'完整通关火鸟岛三人秘境「金库失窃的风铃」。',earned:s=>s.dungeonChallengeRecords?.['journey:gold-bell']?.clears>0},
 {id:'journey:frozen-letter',title:'破冰信使',source:'完整通关寒冰岛精英副本「冰封的回信」。',earned:s=>s.dungeonChallengeRecords?.['journey:frozen-letter']?.clears>0},
 {id:'journey:storm-compass',title:'风眼掌盘师',source:'完整通关寒冰岛四人秘境「风暴中心的罗盘」。',earned:s=>s.dungeonChallengeRecords?.['journey:storm-compass']?.clears>0},
 {id:'journey:sand-echo',title:'沙海聆听者',source:'完整通关沙漠岛精英副本「沙海回声」。',earned:s=>s.dungeonChallengeRecords?.['journey:sand-echo']?.clears>0},
 {id:'journey:oasis-key',title:'绿洲执钥人',source:'完整通关沙漠岛三人秘境「绿洲的最后一把钥匙」。',earned:s=>s.dungeonChallengeRecords?.['journey:oasis-key']?.clears>0},
 {id:'journey:night-promise',title:'夜约守望者',source:'完整通关幽暗岛精英副本「梦魇尽头的约定」。',earned:s=>s.dungeonChallengeRecords?.['journey:night-promise']?.clears>0},
 {id:'journey:marsh-beacon',title:'深沼点航人',source:'完整通关幽暗岛四人秘境「沼泽中的航标」。',earned:s=>s.dungeonChallengeRecords?.['journey:marsh-beacon']?.clears>0},
 {id:'journey:tide:elite-1',title:'潮灯引航者',source:'完整通关潮汐岛精英秘境「失声的潮灯」。',earned:s=>s.dungeonChallengeRecords?.['journey:tide:elite-1']?.clears>0},
 {id:'journey:tide:elite-2',title:'潮信追风者',source:'完整通关潮汐岛五波终极秘境「被风吹散的回信」。',earned:s=>s.dungeonChallengeRecords?.['journey:tide:elite-2']?.clears>0},
 {id:'journey:float:elite-1',title:'双图测绘师',source:'完整通关浮岸岛精英秘境「两岸的旧测量台」。',earned:s=>s.dungeonChallengeRecords?.['journey:float:elite-1']?.clears>0},
 {id:'journey:float:elite-2',title:'瀑下勘图师',source:'完整通关浮岸岛五波终极秘境「瀑布下的空白图」。',earned:s=>s.dungeonChallengeRecords?.['journey:float:elite-2']?.clears>0},
 {id:'journey:sail:elite-1',title:'归帆掌舵人',source:'完整通关风帆岛精英秘境「只准欢呼的档案室」。',earned:s=>s.dungeonChallengeRecords?.['journey:sail:elite-1']?.clears>0},
 {id:'journey:sail:elite-2',title:'白帆终夜守望者',source:'完整通关风帆岛五波终极秘境「白帆最后的守夜」。',earned:s=>s.dungeonChallengeRecords?.['journey:sail:elite-2']?.clears>0},
 {id:'tide-story',title:'潮灯寄信人',source:'完成潮汐岛主线故事「没有送到的回答」。',earned:s=>!!s.quests?.[870011]?.claimed},
 {id:'dark-story',title:'幽谷守灯人',source:'完成幽暗岛防线故事「幽月誓约」，点亮幽谷、石脊与禁地灯火。',earned:s=>!!s.quests?.[874005]?.claimed},
 {id:'float-story',title:'双图共绘者',source:'完成浮岸岛主线故事「两张图都是真的」。',earned:s=>!!s.quests?.[870111]?.claimed},
 {id:'sail-story',title:'白帆归航者',source:'完成风帆岛主线故事「庆典前的求救」。',earned:s=>!!s.quests?.[870211]?.claimed},
 {id:'archipelago-steward',title:'群岛寻迹者',source:'在中后期群岛中完成至少四处引火台、破冰信箱、绿洲铜盘或双海图现场机关。',earned:s=>midLatePuzzlesCompletedCount(s)>=4},
 {id:'tower-climber-20',title:'高塔登阶者',source:'在任意岛屿试炼塔中突破第 20 层。',earned:s=>Object.values(s.towerRecords||{}).some(r=>(r?.floor||0)>=20)},
 {id:'tower-summit-late',title:'群岛试炼登顶者',source:'登顶任意一座 30 层及以上的中后期试炼塔。',earned:s=>[['journey:tower-fire',30],['journey:tower-ice',50],['journey:tower-desert',70],['journey:tower-dark',100],['journey:tide:tower',60],['journey:float:tower',80],['journey:sail:tower',100]].some(([id,top])=>(s.towerRecords?.[id]?.floor||0)>=top)},
 {id:'fishing-trophy-master',title:'海滨巨物猎手',source:'在钓鱼图鉴中集齐全部 6 种渔获，或达成至少 3 种巨物纪录。',earned:s=>{const a=fishingAlbumSummary(s);return a.caughtSpecies>=a.totalSpecies||a.hugeSpecies>=3;}},
 {id:'campfire-chef',title:'营火料理师',source:'在营火烹饪锅中完成至少 5 次料理或魔药炼成。',earned:s=>campfireCountCooked(s)>=5},
 {id:'trilogy-explorer',title:'后三岛巡航者',source:'发掘潮汐、浮岸与风帆三岛全部 9 处隐藏风物与航标彩蛋。',earned:s=>trilogyCurioCount(s)>=ALL_TRILOGY_CURIOS.length},
 {id:'cross-world-chronicler',title:'双界时光行者',source:'在双世界与时光长卷中领取至少 3 项探索里程碑赏金。',earned:s=>(s.earthTimeClaims?.length||0)>=3},
 ...TACTICS_CHALLENGES.map(row=>({id:'tactical:'+row.id,title:row.honor,source:'首次战胜'+row.title+'。',earned:s=>s.tacticsChallenges?.completed?.[row.id]?.wins>0})),
];
const ALL_HONOR_IDS=new Set(rules.map(r=>r.id));
export function adventureHonors(save){return rules.map(({earned,...row})=>({...row,earned:earned(save)}));}
export function activeAdventureHonor(save){
 const earned=adventureHonors(save).filter(row=>row.earned);
 if(save?.equippedHonor){
  const match=earned.find(row=>row.id===save.equippedHonor);
  if(match)return match;
 }
 return earned.find(row=>row.id==='tactical:'+save?.tacticsChallenges?.equipped)||earned.at(-1)||null;
}
export function validateEquippedHonor(save){
 if(save?.equippedHonor===undefined||save?.equippedHonor===null)return;
 if(typeof save.equippedHonor!=='string'||!ALL_HONOR_IDS.has(save.equippedHonor))throw Error('佩戴的冒险荣誉编号无效');
}
export function equipAdventureHonor(save,honorId){
 if(save?.pendingEncounter)throw Error('战斗中无法更换荣誉称号');
 if(honorId===null||honorId===undefined||honorId===''){
  delete save.equippedHonor;
  if(save.tacticsChallenges?.equipped)delete save.tacticsChallenges.equipped;
  save.revision=(save.revision||0)+1;
  return {changed:true,honor:activeAdventureHonor(save),message:'已恢复随进度自动展示最高荣誉。'};
 }
 const row=adventureHonors(save).find(r=>r.id===honorId);
 if(!row)throw Error('未知荣誉称号');
 if(!row.earned)throw Error('尚未获得这项荣誉称号');
 save.equippedHonor=row.id;
 if(row.id.startsWith('tactical:')&&save.tacticsChallenges)save.tacticsChallenges.equipped=row.id.slice('tactical:'.length);
 save.revision=(save.revision||0)+1;
 return {changed:true,honor:row,message:`已佩戴荣誉称号「${row.title}」。`};
}
export function dungeonHonorTitle(id){return rules.find(row=>row.id===id)?.title||null;}
