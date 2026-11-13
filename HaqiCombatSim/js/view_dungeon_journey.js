import {el,button} from './view_adventure.js';
import {tr,fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';
import {towerRecord,towerRewardSteps,towerRewardAmount,dungeonEnemyIntel} from './adventure_dungeon_journeys_core.js';
import {dungeonTacticsProfile,dungeonTacticsPreparation} from './dungeon_tactics_core.js';
import {dungeonChallengeLines} from './dungeon_challenge_core.js';
import {guidanceCard} from './view_adventure_guidance.js';
import {dungeonHonorTitle} from './adventure_honors_core.js';
import {dungeonFirstReward} from './dungeon_first_rewards_core.js';

export function renderDungeonJourney(root,{assets,save,dungeon:d},cb){
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal dungeon-entry-confirm');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr(d.name));
    const body=el('div','modal-body'),tower=d.kind==='tower';
    modal.append(el('header','modal-header',el('h2','',d.name),createCloseButton(cb.close)),body);root.append(modal);
    body.append(el('p','',fill('要进入建议 {level} 级的{kind}「{name}」吗？',{level:d.recommendedLevel,kind:tower?'试炼之塔':'精英副本',name:d.name}).text));
    const size=tower?Math.min(4,1+save.formation.filter((id,slot)=>id&&slot!==save.heroSlot).length):d.partySize;
    const intel=dungeonEnemyIntel(d,assets.content.monsters);
    if(intel)body.append(guidanceCard({eyebrow:'本轮真实敌情',title:`${intel.waves} 波 · 每波最多 ${intel.maxEnemies} 名敌人`,steps:[
        `敌人等级 ${intel.minLevel}–${intel.maxLevel}；生命最高的「${intel.toughest}」有 ${intel.maxHp.toLocaleString('zh-CN')} 生命。`,
        `本次需要 ${size} 个出战单位。检查每位成员的等级、当前生命和卡组，主角等级达标并不代表全队准备好了。`
    ],footnote:intel.maxHp>=10000?'这是含高生命首领的挑战，入口等级只是参考；可先挑战较早副本，准备装备与完整队伍后再来。':'敌人的生命与卡牌沿用实际模板；建议等级供准备时参考，可以自由选择挑战。'}));
    if(size>=2)body.append(el('p','muted','安排伙伴时，把它放到与主角不同的卡位才算独立出战；与主角同卡位的伙伴提供支援，不计入出战人数。'));
    const tactic=dungeonTacticsProfile(d);
    if(tactic){
        const preparation=dungeonTacticsPreparation(save,assets.content,d);
        const check=el('details','journey-entry-rewards',el('summary','','出发前检查：等级、卡组与生命'));check.open=preparation.missing;
        check.append(guidanceCard({title:'先把课堂战术装进自己的卡组',steps:preparation.lines,footnote:'这是准备建议，可以自由尝试其他打法。'}));body.append(check);
        const reward=dungeonFirstReward(assets.content,d.id,save.school);
        if(reward)body.append(guidanceCard({eyebrow:save.dungeonChallengeRecords?.[d.id]?.firstRewarded?'首通奖励已领取':'整轮首通奖励',title:reward.item.name,steps:[reward.purpose,reward.level+' 级可装备；领取后到背包比较并穿戴。'],footnote:'单人从头完成整轮挑战后领取一次，最后一战需有体力。领取后可自行选择是否穿戴。'}));
        body.append(guidanceCard({eyebrow:'本次敌阵',title:tactic.title,steps:tactic.steps,footnote:'敌方按两回合节奏准备与进攻。读懂意图，再决定抢攻或防御。'}));
        body.append(guidanceCard({eyebrow:'个人挑战实绩',title:'用更少回合完成整轮挑战',steps:dungeonChallengeLines(save.dungeonChallengeRecords?.[d.id]),footnote:'首次完整通关可获荣誉「'+dungeonHonorTitle(d.id)+'」。统计整轮战斗的累计回合与失利次数；从头挑战开始新一轮。真实玩家协作另行记录。'}));
    }
    body.append(guidanceCard({eyebrow:'带着目标进副本',title:size>=4?'四人分工，集中突破':size>=2?'双人配合，把伤害打在一起':'单人挑战，安排出牌顺序',steps:[
        size>=4?'让不同成员承担强化、布置陷阱、保护和主攻；集中攻击同一个目标。':size>=2?'辅助把强化交给主攻，陷阱挂在集火目标上，再用对应学派攻击。':'先强化自己，再给对手挂对应学派陷阱，最后打出攻击。',
        '看清敌人意图：重击前给进攻者挂虚弱，同时给受击队友加盾。',
        '可选挑战：在一场胜利中触发强化加陷阱，或虚弱加护盾的组合。'
    ],footnote:'不会额外限制你的打法。战斗结束后可查看实际生效次数，胜利实绩记入冒险手记。'}));
    const actions=el('div','dungeon-actions',button('暂不进入',cb.close,'secondary'));
    if(size>=2&&cb.party)actions.append(button('安排出战伙伴',cb.party,'secondary'));
    actions.append(button('进入',()=>cb.prepare(),'primary'));
    body.append(actions);
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
