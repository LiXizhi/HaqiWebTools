import {QUEST_REGIONS,defaultJournalRegion,journalQuestStatus,filterJournalQuests} from './adventure_quest_journal_core.js';
import {currentQuest,questState,questReady,questProgress,rewardsFor} from './adventure_core.js';
import {rewardLabel} from './adventure_rewards_core.js';
import {ItemDetails} from './view_adventure_item_details.js';

// Layout reference: Aries/Quest/QuestListPage.html and QuestDetailFramePage.html.
export function renderQuestJournal(body,model,cb,ui) {
    const {el,button,objectiveLabel}=ui;
    const {save,assets}=model,c=assets.content,current=currentQuest(save,c);
    const inspector=new ItemDetails(body,model,ui);
    const box=body.closest('.modal');box.classList.add('quest-journal-modal');
    const label=q=>journalQuestStatus(save,c,q);
    let rows=c.quests.map(q=>({...q,region:'camp'})),selectedId=model.selectedQuestId||current?.id||rows[0]?.id,page=0;
    const pageSize=20,filters={region:defaultJournalRegion(save),status:''};
    const list=el('nav','journal-directory');list.setAttribute('aria-label','全岛任务');
    const detail=el('article','journal-detail');detail.id='journal-detail';
    const counter=el('span','');
    const pager=el('div','journal-pagination');
    const sidebar=el('aside','journal-sidebar',el('div','journal-chapter',el('strong','','任务清单'),counter),list,pager);
    const toolbar=el('div','journal-filters');
    function dropdown(name,values,onchange){const control=el('select','');control.setAttribute('aria-label',name);for(const [value,label] of values){const option=el('option','',label);option.value=value;control.append(option);}control.addEventListener('change',()=>onchange(control.value));return control;}
    const region=dropdown('任务所在岛屿',[['','全部地区'],...['camp','town','fire','ice','desert','dark','21','22'].map(key=>[key,QUEST_REGIONS[key]])],value=>{filters.region=value;page=0;renderList();});
    const status=dropdown('任务状态',[['','全部状态'],...['可接取','进行中','可交付','已完成','未开启','尚未开放'].map(v=>[v,v])],value=>{filters.status=value;page=0;renderList();});
    region.value=filters.region;
    toolbar.append(region,status);
    const header=box.querySelector('.modal-header');
    header.insertBefore(toolbar,header.lastElementChild);
    const loading=el('div','journal-load-status','正在读取全岛任务…');loading.setAttribute('role','status');
    body.append(loading,el('div','journal-layout',sidebar,detail));
    const entries=new Map();
    function select(row) {
        selectedId=row.id;
        const q=c.quests.find(q=>q.id===row.id);
        if(!q){selectCatalog(row);return;}
        for(const [id,b] of entries){b.classList.toggle('selected',id===q.id);if(id===q.id)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
        const state=questState(save,q.id),active=current?.id===q.id;
        detail.dataset.questId=q.id;
        detail.replaceChildren(el('header','journal-detail-heading',el('span','journal-status',label(q)),el('h3','',q.title)),el('p','journal-description',q.description));
        const section=(title,...children)=>el('section','journal-section',el('h4','',title),...children);
        const goals=questProgress(save,q);
        detail.append(section('任务目标',...(goals.length?goals.map(g=>el('div',`journal-objective ${g.value>=g.count?'complete':''}`,el('span','',objectiveLabel(g,c)),el('strong','',`${g.value} / ${g.count}`))):[el('p','',`与${c.npcs[q.endNpc]?.name||'导师'}交谈，完成指导。`)])));
        detail.append(el('div','journal-contacts',el('p','',el('span','','任务接取'),c.npcs[q.startNpc]?.name||'导师'),el('p','',el('span','','任务交付'),c.npcs[q.endNpc]?.name||'导师')));
        const rewards=rewardsFor(save,c,q);
        detail.append(section(state.claimed?'已获得奖励':'任务奖励',el('div','journal-rewards',...rewards.map(reward=>{
            const item=c.items[reward.id];
            if(!item||reward.kind==='pet'||reward.id===113)return el('span','journal-reward',rewardLabel(c,reward));
            const inspect=button(rewardLabel(c,reward),()=>inspector.show(item,{trigger:inspect,source:q.title}),'journal-reward item-inspect-button');
            inspect.setAttribute('aria-haspopup','dialog');
            inspect.setAttribute('aria-label',`查看${item.name}详情`);
            return inspect;
        }))));
        const footer=el('footer','journal-footer');
        if(active&&!state.claimed)footer.append(button(state.accepted?(questReady(save,q)?'前往交付':'追踪任务目标'):'前往接取',()=>{cb.close();cb.track();},'primary'));
        else footer.append(el('p','',state.claimed?'任务已完成，奖励已领取。':'完成前置任务后开启。'));
        detail.append(footer);detail.scrollTop=0;
    }
    function highlight(id){for(const [qid,b] of entries){b.classList.toggle('selected',qid===id);if(qid===id)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}}
    function selectCatalog(q){
        highlight(q.id);detail.dataset.questId=q.id;
        detail.replaceChildren(el('header','journal-detail-heading',el('span','journal-status',`${QUEST_REGIONS[q.region]||'其他任务'} · ${label(q)}`),el('h3','',q.title)),el('p','journal-description',q.description));
        const section=(title,...nodes)=>el('section','journal-section',el('h4','',title),...nodes);
        detail.append(el('p','journal-unavailable','这段冒险尚未开放，目前可以查看任务内容。'));
        detail.append(section('任务目标',...(q.objectives.length?q.objectives.map(g=>el('div','journal-objective',el('span','',`${g.type==='ClientDialogNPC'?'交谈：':''}${g.name}`),el('strong','',`× ${g.count}`))):[el('p','','与任务居民交谈。')])));
        detail.append(el('div','journal-contacts',el('p','',el('span','','任务接取'),q.startNpc),el('p','',el('span','','任务交付'),q.endNpc)));
        if(q.prerequisites.length)detail.append(section('前置任务',...q.prerequisites.map(p=>{
            const target=rows.find(r=>r.id===p.id);if(!target)return el('p','',p.title);
            return button(p.title,()=>{filters.region=target.region;filters.status='';region.value=target.region;status.value='';selectedId=target.id;page=Math.floor(filterJournalQuests(rows,filters,save,c).findIndex(q=>q.id===target.id)/pageSize);renderList();},'journal-prerequisite');
        })));
        if(q.requirements.length||q.validDate)detail.append(section('原版接取条件',...q.requirements.map(r=>el('p','',`${r.name}：${r.min||'0'}${r.max&&r.max!=='-1'?` ～ ${r.max}`:''}`)),...(q.validDate?[el('p','',q.validDate)]:[])));
        detail.append(section('任务奖励',...(q.rewards.length?q.rewards.map(group=>el('div','journal-reward-group',el('p','muted',`${group.choice==='-1'?'固定奖励':'可选奖励'}${group.schoolFilter?' · 按学系选择':''}`),el('div','journal-rewards',...group.items.map(r=>{const item=c.items[r.id],label=`${item?.name||r.name} × ${r.count}`;if(!item||r.id===113)return el('span','journal-reward',label);const inspect=button(label,()=>inspector.show(item,{trigger:inspect,source:q.title}),'journal-reward item-inspect-button');inspect.setAttribute('aria-haspopup','dialog');inspect.setAttribute('aria-label',`查看${item.name}详情`);return inspect;})))):[el('p','','无物品奖励')])));
        detail.append(el('footer','journal-footer',el('p','',`任务编号 ${q.id} · 开放后可接取`)));detail.scrollTop=0;
    }
    function renderList(){
        const filtered=filterJournalQuests(rows,filters,save,c),pages=Math.max(1,Math.ceil(filtered.length/pageSize));
        page=Math.max(0,Math.min(page,pages-1));entries.clear();list.replaceChildren();pager.replaceChildren();
        counter.textContent=`${filtered.length} / ${rows.length} 项`;
        for(const [index,q] of filtered.slice(page*pageSize,(page+1)*pageSize).entries()){
            const b=button([el('span','journal-index',String(page*pageSize+index+1).padStart(2,'0')),el('span','journal-entry-text',el('strong','',q.title),el('small','',label(q)))],()=>select(q),'journal-entry');
            b.dataset.questId=q.id;b.setAttribute('aria-controls',detail.id);entries.set(q.id,b);list.append(b);
        }
        const previous=button('上一页',()=>{page--;renderList();},'secondary'),next=button('下一页',()=>{page++;renderList();},'secondary');
        previous.disabled=page===0;next.disabled=page===pages-1;
        pager.append(previous,el('span','',`${page+1} / ${pages}`),next);
        const visible=filtered.slice(page*pageSize,(page+1)*pageSize);
        const initial=visible.find(q=>q.id===Number(selectedId))||visible[0];
        if(initial)select(initial);else{list.append(el('p','muted','没有符合条件的任务'));detail.replaceChildren(el('p','muted','请调整岛屿或任务状态。'));delete detail.dataset.questId;}
        list.scrollTop=0;
    }
    renderList();
    async function load(){
        loading.hidden=false;loading.textContent='正在读取全岛任务…';
        try{
            if(!assets.loadQuestJournal)throw Error('任务目录未配置');
            const data=await assets.loadQuestJournal();if(!body.isConnected)return;
            const playableIds=new Set(c.quests.map(q=>q.id));
            rows=data.quests.filter(q=>!q.obsolete).sort((a,b)=>Number(playableIds.has(b.id))-Number(playableIds.has(a.id))||a.id-b.id);
            loading.hidden=true;renderList();
        }catch(error){if(!body.isConnected)return;loading.replaceChildren(el('span','','全岛任务读取失败，已保留教学任务。'),button('重试',load,'secondary'));}
    }
    load();
    box.addEventListener('keydown',event=>{
        if(event.key!=='Tab'||event.target.closest('dialog'))return;
        const controls=[...box.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(n=>n.getClientRects().length);
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
}
