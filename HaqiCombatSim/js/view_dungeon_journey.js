import {el,button} from './view_adventure.js';
import {tr,fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';
import {towerRecord,towerRewardSteps,towerRewardAmount} from './adventure_dungeon_journeys_core.js';

export function renderDungeonJourney(root,{assets,save,dungeon:d},cb){
    root.replaceChildren();root.className='overlay visible';
    const modal=el('section','modal dungeon-entry-confirm');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label',tr(d.name));
    const body=el('div','modal-body'),tower=d.kind==='tower';
    modal.append(el('header','modal-header',el('h2','',d.name),createCloseButton(cb.close)),body);root.append(modal);
    body.append(el('p','',fill('要进入建议 {level} 级的{kind}「{name}」吗？',{level:d.recommendedLevel,kind:tower?'试炼之塔':'精英副本',name:d.name}).text));
    const actions=el('div','dungeon-actions',button('暂不进入',cb.close,'secondary'),button('进入',()=>cb.prepare(),'primary'));
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
