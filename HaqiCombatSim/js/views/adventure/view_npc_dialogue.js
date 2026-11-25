import {catalogQuestsForNpc,catalogTalksForNpc} from '../../adventure_catalog_quests_core.js';
import {npcCharacter} from '../../adventure_city_people_core.js';
import {currentQuest,questState,questReady,pendingQuestTalk,rewardsFor,catalogStatSnapshot} from '../../adventure_core.js';
import {npcServices,npcHasActiveQuest,npcPurpose} from '../../adventure_npc_core.js';
import {islandName} from '../../adventure_world_map_core.js';
import {forestCommissionAvailable,forestCommissionPhase,FOREST_NPCS} from '../../forest_commission_core.js';
import {heroPortrait} from '../../hero_renderer.js';
import {dialogueLearningLines} from '../../locale.js';
import {tr,setText,fill} from '../../locale_runtime.js';
import {createCloseButton} from '../../ui/controls.js';
import {bindDialogue} from './view_adventure_dialogue.js';
import {guidanceCard} from './view_adventure_guidance.js';
import {rewardChip} from './view_adventure_quests.js';
import {el,button,art} from './primitives.js';

export function renderDialogue(root,model,dialog,cb) {
    root.disposeDialogue?.();
    const {assets,save}=model,c=assets.content,npc=(dialog.lines?(c.npcs[dialog.lines[dialog.index]?.npcId]||(dialog.lines[dialog.index]?.speakerName?{id:dialog.lines[dialog.index].npcId,name:dialog.lines[dialog.index].speakerName,zone:save.zone}:null)):dialog.npc)||c.npcs[dialog.npcId];root.replaceChildren();root.className='overlay dialogue-layer rpg-dialogue-layer visible';
    const box=el('section','dialogue-box rpg-dialogue');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',fill('与{name}交谈',{name:npc.name}).text);
    box.classList.toggle('dialogue-sequence',!!dialog.lines);
    const character=npcCharacter(npc,assets.hero?.manifest);
    const portrait=character?heroPortrait(assets,character,240,304):art(assets,npc.portrait,240,304,'dialogue-portrait');portrait.classList.add('dialogue-portrait');
    portrait.setAttribute('aria-label',npc.name);box.classList.add('companion-conversation');
    const content=el('div','dialogue-content',el('p','eyebrow',dialog.locationLabel||islandName(npc.zone)),el('h2','',npc.name));
    const activeQuest=Array.isArray(c.quests)&&save.quests?currentQuest(save,c):null;
    box.dataset.emotion=activeQuest&&questReady(save,activeQuest)&&activeQuest.endNpc===npc.id?'happy':'attentive';
    const close=createCloseButton(cb.close);
    if(cb.chat&&!npcHasActiveQuest(save,c,npc.id)){
        const chat=button('',()=>cb.chat(npc),'dialogue-chat');
        chat.title=fill('与{name}交谈',{name:npc.name}).text;chat.setAttribute('aria-label',chat.title);
        chat.innerHTML='<svg viewBox="0 0 40 36" aria-hidden="true"><path d="M10 3h20a7 7 0 0 1 7 7v10a7 7 0 0 1-7 7h-7l-6 6v-6h-7a7 7 0 0 1-7-7V10a7 7 0 0 1 7-7Z" fill="#fffbe9" stroke="#7a6335" stroke-width="1.8"/><g fill="#7a6335"><circle cx="12" cy="15" r="2"/><circle cx="20" cy="15" r="2"/><circle cx="28" cy="15" r="2"/></g></svg>';
        box.append(chat);
    }
    if(dialog.lines){
        const line=dialog.lines[dialog.index],last=dialog.index===dialog.lines.length-1;
        const replyLabel=entry=>entry.buttons?.[0]?.label&&!entry.buttons[0].label.includes('NEXT')?entry.buttons[0].label:'继续';
        const finalReply=dialog.lines.at(-1)?.buttons?.[0]?.label;
        const lastLabel=dialog.preserveReply&&finalReply&&!finalReply.includes('NEXT')?finalReply:dialog.finishLabel;
        const labels=dialog.lines.map((entry,index)=>index===dialog.lines.length-1?lastLabel:replyLabel(entry));
        // Reserve the same width for every step, including the longest reply.
        box.style.setProperty('--dialogue-action-width',`${Math.max(150,...labels.map(label=>Array.from(label||'继续').length*14+36))}px`);
        const next=button(last?lastLabel:replyLabel(line),cb.next,'primary');
        if(last)next.title=tr(dialog.finishLabel);
        content.append(el('p','dialogue-text',line.text));
        const quest=Array.isArray(c.quests)&&save.quests?currentQuest(save,c):null;
        if(last&&quest&&[63002,63003].includes(quest.id)&&[quest.startNpc,quest.endNpc].includes(npc.id)){
            for(const reward of rewardsFor(save,c,quest)){
                const item=c.items[reward.id];if(!item?.slot)continue;
                const cards=[139,140,141].map(id=>c.cardItems[item.stats?.[id]]).filter(Boolean).map(key=>assets.dataset.cards[key]?.name||key);
                content.append(el('div','opening-equipment-preview',art(assets,item.art,64,64),el('div','',
                    el('strong','',item.name),
                    el('p','',cards.length?'穿上可用：'+cards.join('、'):'穿上后提升角色属性。'))));
            }
        }
        const footer=el('div','dialogue-bottom',el('span','muted',`${dialog.index+1} / ${dialog.lines.length}`));
        if(dialog.index>0)footer.append(button('上一句',()=>{dialog.index--;renderDialogue(root,model,dialog,cb);},'text-button dialogue-back'));
        footer.append(next);content.append(footer);
    }
    else {
        const q=currentQuest(save,c),state=q&&questState(save,q.id),ready=q&&questReady(save,q);
        const snap=catalogStatSnapshot(save,c),here=catalogQuestsForNpc(save,c,npc.id,snap);
        const greeting=npc.description||'欢迎来到这里，年轻的魔法师。愿你的旅程充满惊喜。';
        content.append(el('p','dialogue-text',npc.worldObservation?`${greeting}\n\n${npc.worldObservation.prompt}`:greeting));
        const choices=el('div','dialogue-choices');
        if(q&&(q.startNpc===npc.id||q.endNpc===npc.id))content.append(el('div','dialogue-rewards',el('span','dialogue-reward-label','任务奖励'),...rewardsFor(save,c,q).map(r=>rewardChip(c,r,{el}))));
        if(q&&!state.accepted&&q.startNpc===npc.id){const accept=button('',()=>cb.startQuest(q),'primary');setText(accept,'接取任务 · {title}',{title:q.title});choices.append(accept);}
        if(q&&ready&&q.endNpc===npc.id){const claim=button('',()=>cb.finishQuest(q),'primary');setText(claim,'完成任务 · {title}',{title:q.title});choices.append(claim);}
        for(const quest of here.accept){const accept=button('',()=>cb.startCatalog(quest),'primary');setText(accept,'接取任务 · {title}',{title:quest.title});choices.append(accept);}
        for(const quest of here.claim){const claim=button('',()=>cb.finishCatalog(quest),'primary');setText(claim,'完成任务 · {title}',{title:quest.title});choices.append(claim);}
        for(const {quest,talk} of catalogTalksForNpc(save,c,npc.id,snap))choices.append(button(fill('{title} · {label}',{title:quest.title,label:talk.label||'交谈'}).text,()=>cb.questTalk(quest,talk),'primary'));
        if(dialog.questDialogue){
            dialog.questDialogue=false;
            if(choices.children.length===1){choices.children[0].click();return;}
        }
        const talk=pendingQuestTalk(save,q,npc.id);
        if(talk)choices.append(button(talk.label||'我想了解更多魔法',()=>cb.questTalk(q,talk),'primary'));
        if(q&&state.accepted&&!(ready&&q.endNpc===npc.id))choices.append(button(ready?'前往回报任务':'查看任务目标',()=>{cb.close();cb.track();},'secondary'));
        const services=el('div','dialogue-service-choices'),purpose=npcPurpose(c,npc);
        if(purpose){
            const available=purpose.action!=='tactics'||typeof cb.tactics==='function';
            content.append(guidanceCard({eyebrow:purpose.role,title:purpose.title,body:purpose.body,footnote:available?'':'请在单人冒险中和茜茜出发打怪。'}));
            if(available)choices.append(button(purpose.label,()=>purpose.action==='tactics'?cb.tactics():cb.panel(purpose.panel,{npc}),'secondary'));
        }
        if(forestCommissionAvailable(save)&&[FOREST_NPCS.giver,FOREST_NPCS.receiver].includes(npc.id)&&!model.localSecond){
            const phase=forestCommissionPhase(save);
            const label=phase==='offer'?'营地急件：接取寻物委托':phase==='done'?(save.forestCommission?.mystery?.status==='solved'?'查看森林委托记录':'和茜茜调查草屑和脚印'):'继续森林补给委托';
            choices.append(button(label,()=>cb.panel('forest-commission'),'secondary'));
        }
        if(npcServices(c,npc).length&&purpose?.panel!=='npc-services')services.append(button('查看商品与学习魔法',()=>cb.panel('npc-services',{npc}),'secondary'));
        if(npc.worldObservation){
            services.append(button(npc.worldObservation.label,()=>cb.panel('earthmap'),'secondary'));
        }
        choices.append(button('下次再聊',cb.close,'text-button'));content.append(choices);
        if(services.children.length){
            const more=el('details','dialogue-services',el('summary','','还有别的事'),services);
            // With no quest action, expose the resident's actual services immediately.
            if(choices.children.length===1)more.open=true;
            content.append(more);
        }
    }
    const hint=el('p','dialogue-hint');
    content.append(hint);
    box.append(portrait,content,close);root.append(box);
    const dialogueText=content.querySelector('.dialogue-text');
    bindDialogue(root,box,dialogueText,hint,content.querySelector('button.primary')||content.querySelector('button'),{
        keywords:[...Object.values(c.npcs).filter(n=>n.zone===save.zone).map(n=>n.name),...(activeQuest?rewardsFor(save,c,activeQuest).map(r=>c.items[r.id]?.name):[])].filter(Boolean).flatMap(word=>[word,tr(word)]),
        languageSource:`npc:${npc.id||npc.name||'dialogue'}`,languageLabel:npc.name?`${npc.name}的对白`:'NPC对白',
        lines:dialogueLearningLines(dialogueText.dataset.zh||dialogueText.textContent,save.languageLearning),autoReadDialogue:save.languageLearning.enabled&&save.languageLearning.autoReadDialogue!==false,readAloud:(text,locale,signal)=>cb.readDialogue(text,locale,signal,npc),mapWords:cb.mapDialogue,targetLocale:save.languageLearning.target,close:cb.close,
    });
}
