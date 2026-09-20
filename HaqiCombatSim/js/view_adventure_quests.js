import {currentQuest,questState,questReady,questProgress,rewardsFor} from './adventure_core.js';
import {rewardLabel} from './adventure_rewards_core.js';

// Layout reference: Aries/Quest/QuestListPage.html and QuestDetailFramePage.html.
export function renderQuestJournal(body,model,cb,{el,button,objectiveLabel}) {
    const {save,assets}=model,c=assets.content,current=currentQuest(save,c);
    const box=body.closest('.modal');box.classList.add('quest-journal-modal');
    const label=q=>{const s=questState(save,q.id);return s.claimed?'已完成':s.accepted?(questReady(save,q)?'可交付':'进行中'):current?.id===q.id?'可接取':'未开启';};
    const list=el('nav','journal-directory');list.setAttribute('aria-label','章节任务');
    const detail=el('article','journal-detail');detail.id='journal-detail';
    const completed=c.quests.filter(q=>questState(save,q.id).claimed).length;
    const sidebar=el('aside','journal-sidebar',el('div','journal-chapter',el('strong','','初心之旅'),el('span','',`已完成 ${completed} / ${c.quests.length}`)),list);
    body.append(el('div','journal-layout',sidebar,detail));
    const entries=new Map();
    function select(q) {
        for(const [id,b] of entries){b.classList.toggle('selected',id===q.id);if(id===q.id)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
        const state=questState(save,q.id),active=current?.id===q.id;
        detail.dataset.questId=q.id;
        detail.replaceChildren(el('header','journal-detail-heading',el('span','journal-status',label(q)),el('h3','',q.title)),el('p','journal-description',q.description));
        const section=(title,...children)=>el('section','journal-section',el('h4','',title),...children);
        const goals=questProgress(save,q);
        detail.append(section('任务目标',...(goals.length?goals.map(g=>el('div',`journal-objective ${g.value>=g.count?'complete':''}`,el('span','',objectiveLabel(g,c)),el('strong','',`${g.value} / ${g.count}`))):[el('p','',`与${c.npcs[q.endNpc]?.name||'导师'}交谈，完成指导。`)])));
        detail.append(el('div','journal-contacts',el('p','',el('span','','任务接取'),c.npcs[q.startNpc]?.name||'导师'),el('p','',el('span','','任务交付'),c.npcs[q.endNpc]?.name||'导师')));
        const rewards=rewardsFor(save,c,q);
        detail.append(section(state.claimed?'已获得奖励':'任务奖励',el('div','journal-rewards',...rewards.map(r=>el('span','journal-reward',rewardLabel(c,r))))));
        const footer=el('footer','journal-footer');
        if(active&&!state.claimed)footer.append(button(state.accepted?(questReady(save,q)?'前往交付':'追踪任务目标'):'前往接取',()=>{cb.close();cb.track();},'primary'));
        else footer.append(el('p','',state.claimed?'任务已完成，奖励已领取。':'完成前置任务后开启。'));
        detail.append(footer);detail.scrollTop=0;
    }
    c.quests.forEach((q,index)=>{
        const b=button([el('span','journal-index',String(index+1).padStart(2,'0')),el('span','journal-entry-text',el('strong','',q.title),el('small','',label(q)))],()=>select(q),'journal-entry');
        b.dataset.questId=q.id;b.setAttribute('aria-controls',detail.id);entries.set(q.id,b);list.append(b);
    });
    const initial=c.quests.find(q=>String(q.id)===String(model.selectedQuestId))||current||c.quests.at(-1);
    if(initial){select(initial);requestAnimationFrame(()=>{const b=entries.get(initial.id);if(b.isConnected){list.scrollTop=b.offsetTop-list.offsetTop-list.clientHeight/2+b.clientHeight/2;b.focus({preventScroll:true});}});}
    box.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const controls=[...box.querySelectorAll('button:not(:disabled)')].filter(n=>n.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
}
