import {el, button} from './primitives.js';
import {tr,fill} from '../../locale_runtime.js';
import {createCloseButton} from '../../ui/controls.js';
import {towerRecord,towerRewardSteps,towerRewardAmount,dungeonEnemyIntel} from '../../adventure_dungeon_journeys_core.js';
import {dungeonTacticsProfile,dungeonTacticsPreparation} from '../../dungeon_tactics_core.js';
import {dungeonChallengeMessages} from '../../dungeon_challenge_core.js';
import {guidanceCard} from './view_adventure_guidance.js';
import {dungeonHonorTitle} from '../../adventure_honors_core.js';
import {dungeonFirstReward} from '../../dungeon_first_rewards_core.js';
import {playerSpec} from '../../adventure_core.js';
import {dungeonProgress} from '../../adventure_coop_core.js';
import {SPARK_DUNGEON} from '../../spark_rescue_core.js';
import {dungeonWatchStory} from '../../dungeon_watch_story_core.js';

export function renderDungeonJourney(root,{assets,save,dungeon:d,restart=false},cb){
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal dungeon-entry-confirm');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr(d.name));
    const body=el('div','modal-body'),tower=d.kind==='tower';
    const cleared=dungeonProgress(save)?.[d.id]?.cleared||[];
    const clearedCount=tower?0:d.arenas.filter(a=>cleared.includes(a.id)).length;
    const complete=!tower&&d.arenas.length>0&&d.arenas.every(a=>cleared.includes(a.id));
    const returnToSpark=d.id===SPARK_DUNGEON&&complete&&!restart;
    const startOver=!tower&&(restart||(complete&&!returnToSpark));
    modal.append(el('header','modal-header',el('h2','',d.name),createCloseButton(cb.close)),body);root.append(modal);
    body.append(el('p','',fill('要进入建议 {level} 级的{kind}「{name}」吗？',{level:d.recommendedLevel,kind:tower?'试炼之塔':'精英副本',name:d.name}).text));
    const watch=dungeonWatchStory(save,d,startOver?[]:cleared);
    if(watch){
        const story=el('section','journey-entry-story');story.setAttribute('data-story-id',watch.id);story.setAttribute('aria-label',tr(watch.title));
        story.append(el('strong','',watch.title),el('p','',watch.line),el('blockquote','',watch.reply));body.append(story);
    }
    const tactic=dungeonTacticsProfile(d),companionSlots=tactic?.companionSlots;
    const nextWave=tower?-1:startOver?0:d.arenas.findIndex(a=>!cleared.includes(a.id));
    if(!tower&&!returnToSpark&&nextWave>=0){
        const progress=el('section','journey-entry-progress');progress.setAttribute('aria-label',tr('本轮进度'));
        progress.append(el('small','',fill('已清理 {cleared} / {total} 处营地',{cleared:startOver?0:clearedCount,total:d.arenas.length}).text),el('strong','',fill('接下来：第 {wave} 波',{wave:nextWave+1}).text));
        if(tactic?.steps?.length)progress.append(el('p','',tactic.steps[tactic.steps.length===d.arenas.length?nextWave:0]));
        body.append(progress);
    }
    const selectedSize=Math.min(4,1+save.formation.filter((id,slot)=>id&&slot!==save.heroSlot).length);
    const size=tower?selectedSize:companionSlots?Math.min(companionSlots,selectedSize):d.partySize;
    const reference=el('div','journey-entry-reference');
    const detail=(label,...cards)=>{const node=el('details','journey-entry-rewards',el('summary','',label));node.append(...cards);reference.append(node);return node;};
    const intel=dungeonEnemyIntel(d,assets.content.monsters);
    if(intel)detail('查看完整敌情',guidanceCard({eyebrow:'本轮真实敌情',title:{source:'{waves} 波 · 每波最多 {maxEnemies} 名敌人',vars:{waves:intel.waves,maxEnemies:intel.maxEnemies}},steps:[
        {source:'敌人等级 {minLevel}–{maxLevel}；生命最高的「{enemy}」有 {hp} 生命。',vars:{minLevel:intel.minLevel,maxLevel:intel.maxLevel,enemy:intel.toughest,hp:intel.maxHp.toLocaleString('zh-CN')}},
        {source:companionSlots?'可独自挑战，也可带一位已出战伙伴；当前将有 {size} 个出战单位。检查各自的生命与卡组。':'本次需要 {size} 个出战单位。检查每位成员的等级、当前生命和卡组，主角等级达标并不代表全队准备好了。',vars:{size}}
    ],footnote:intel.maxHp>=10000?'这是含高生命首领的挑战，入口等级只是参考；可先挑战较早副本，准备装备与完整队伍后再来。':'敌人的生命与卡牌沿用实际模板；建议等级供准备时参考，可以自由选择挑战。'}));
    if(intel?.maxHp>=10000)body.append(el('p','journey-entry-warning','这是含高生命首领的挑战，入口等级只是参考；可先挑战较早副本，准备装备与完整队伍后再来。'));
    if(size>=2||companionSlots)detail('查看伙伴出战说明',el('p','muted','安排伙伴时，把它放到与主角不同的卡位才算独立出战；与主角同卡位的伙伴提供支援，不计入出战人数。'));
    if(tactic){
        const preparation=dungeonTacticsPreparation(save,assets.content,d,playerSpec(save,assets.content));
        const check=el('details','journey-entry-rewards',el('summary','','出发前检查：等级、卡组与生命'));check.open=preparation.missing;
        check.append(guidanceCard({title:'先把课堂战术装进自己的卡组',steps:preparation.messages,footnote:'这是准备建议，可以自由尝试其他打法。'}));body.append(check);
        const reward=dungeonFirstReward(assets.content,d.id,save.school);
        if(reward)detail('查看首通奖励',guidanceCard({eyebrow:save.dungeonChallengeRecords?.[d.id]?.firstRewarded?'首通奖励已领取':'整轮首通奖励',title:reward.item.name,steps:[reward.purpose,{source:'{level} 级可装备；领取后到背包比较并穿戴。',vars:{level:reward.level}}],footnote:'从头完成个人整轮挑战后领取一次；真实玩家协作另行记录。领取后可自行选择是否穿戴。'}));
        detail('查看整轮战术',guidanceCard({eyebrow:'本次敌阵',title:tactic.title,steps:tactic.steps,footnote:tactic.version===2?'每波准备与进攻的节奏不同。留意战中本轮意图、下一回合预告和实际状态，再决定出牌顺序。':'敌方按两回合节奏准备与进攻。读懂意图，再决定抢攻或防御。'}));
        detail('查看挑战实绩',guidanceCard({eyebrow:'个人挑战实绩',title:'用更少回合完成整轮挑战',steps:dungeonChallengeMessages(save.dungeonChallengeRecords?.[d.id]),footnote:{source:'首次完整通关可获荣誉「{honor}」。统计整轮战斗的累计回合与失利次数；从头挑战开始新一轮。真实玩家协作另行记录。',vars:{honor:dungeonHonorTitle(d.id)}}}));
    }
    detail('查看配合与出牌建议',guidanceCard({eyebrow:'带着目标进副本',title:size>=4?'四人分工，集中突破':size>=2?'双人配合，把伤害打在一起':'单人挑战，安排出牌顺序',steps:[
        size>=4?'让不同成员承担强化、布置陷阱、保护和主攻；集中攻击同一个目标。':size>=2?'辅助把强化交给主攻，陷阱挂在集火目标上，再用对应学派攻击。':'先强化自己，再给对手挂对应学派陷阱，最后打出攻击。',
        '看清敌人意图：手中有对应卡牌时，可在重击前给进攻者挂虚弱，或给受击队友加盾；也可以抢先攻击。',
        '可选挑战：在一场胜利中触发强化加陷阱，或虚弱加护盾的组合。'
    ],footnote:'不会额外限制你的打法。战斗结束后可查看实际生效次数，胜利实绩记入冒险手记。'}));
    const actions=el('div','dungeon-actions');
    if(returnToSpark)body.append(el('p','muted','守卫已经清理，可以前往出口旁的避风灯台。'));
    else if(startOver)body.append(el('p','muted','将从第一处营地开始新一轮；已领取的首通奖励与个人最佳记录会保留。'));
    else if(clearedCount&&!tower)body.append(el('p','muted',fill('继续本轮进度：已清理 {cleared} / {total} 处营地。',{cleared:clearedCount,total:d.arenas.length}).text));
    const enterLabel=returnToSpark?(save.sparkRescue?.status==='safe'?'重访避风灯台':'继续护送火种'):startOver?'从头开始新一轮':clearedCount&&!tower?'继续本轮':'进入';
    actions.append(button(enterLabel,()=>cb.prepare(startOver),'primary'));
    if((size>=2||companionSlots)&&cb.party)actions.append(button('安排出战伙伴',cb.party,'secondary'));
    if(returnToSpark)actions.append(button('从头开始新一轮',()=>cb.prepare(true),'secondary'));
    actions.append(button('暂不进入',cb.close,'secondary'));
    body.append(actions,reference);
    if(tower){
        const details=el('details','journey-entry-rewards',el('summary','','查看攀登进度与奖励'));
        const row=towerRecord(save,d.id);details.append(el('p','',fill('已通过 {floor} / {floors} 层',{floor:row.floor,floors:d.floors}).text));
        for(const floor of towerRewardSteps(d)){
            const claimed=row.claimed.includes(floor),b=button(claimed?'已领取':row.floor>=floor?'领取':'未解锁',()=>cb.claim(floor),'secondary');b.disabled=claimed||row.floor<floor;
            details.append(el('div','journey-reward',el('span','',fill('第 {floor} 层 · {amount} 奇豆',{floor,amount:towerRewardAmount(assets.content,d,floor)}).text),b));
        }body.append(details);
    }
    actions.querySelector('.primary')?.focus();
}
