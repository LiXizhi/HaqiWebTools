import {createCloseButton} from './view_adventure_controls.js';
import { petParams, STAGE_NAMES, petStage, petCapacity, petMaxHp, FOOD_ID } from './adventure_pets_core.js';
import { createCardFace } from './view_adventure_card.js';
import { createPetEvolution } from './view_adventure_pet_status.js';
// A native nested dialog keeps the shop filters, page and scroll position intact.
export function showPetDetails(assets,id,portrait,{el,button,spellFace},options={}) {
    const def=assets.content.pets[id];
    const trigger=document.activeElement,dialog=el('dialog','modal pet-growth-modal');
    dialog.setAttribute('aria-label',`${def.name} · 四阶段与卡片`);
    const close=()=>dialog.close();
    const exit=createCloseButton(close,'关闭宠物详情');
    dialog.append(el('header','modal-header',el('div','',el('p','eyebrow','宠物图鉴 · 成长与魔法'),el('h2','',def.name)),exit));
    dialog.classList.add('pet-profile-modal');
    const body=el('div','modal-body'),tabs=el('nav','pet-profile-tabs'),content=el('div','pet-profile-content');
    const p=petParams(assets.content),pet=options.save?.pets[id];
    let draft=pet?.deck.map(row=>({...row}))||[],active=pet?'care':'growth';
    const total=()=>draft.reduce((sum,row)=>sum+row.count,0);
    const perform=action=>{close();options.action(action);};
    function paint(){
        content.replaceChildren();
        for(const tab of tabs.children){const selected=tab.dataset.tab===active;tab.setAttribute('aria-pressed',String(selected));}
        if(active==='care'){
            const stage=petStage(pet.level,assets.content),info=el('div','pet-profile-info');
            info.append(el('h3','',`${def.traits.elementalAttribute}系 · ${STAGE_NAMES[stage]}`),el('p','',`等级 ${pet.level} · 经验 ${pet.xp}`));
            for(const [label,value,max] of [['生命',pet.hp,petMaxHp(pet,assets.content)],['饱食',pet.hunger,100]]){
                const meter=el('progress',`pet-meter pet-meter-${label==='饱食'?'hunger':'hp'}`);meter.max=max;meter.value=value;meter.setAttribute('aria-label',label);
                info.append(el('label','pet-stat',el('span','',`${label} ${Math.floor(value)} / ${max}`),meter));
            }
            const feed=button(`喂食 · 营养餐 ${options.save.inventory[FOOD_ID]||0}`,()=>perform({type:'pet-feed',petId:id}),'primary');feed.disabled=pet.hunger>=100||!(options.save.inventory[FOOD_ID]>0);info.append(feed);
            if(pet.hunger===0)info.append(el('p','pet-supply-notice','饥饿中 · 已暂停自然回血'));
            if(!(options.save.inventory[FOOD_ID]>0))info.append(button('购买营养餐',()=>{close();options.shop();},'secondary'));
            content.append(el('div','pet-profile-overview',el('div','pet-profile-portrait',portrait(assets,id,stage,180)),info));
            const positions=el('div','pet-position-actions');
            for(let index=0;index<4;index++){
                const current=options.save.formation[index]===id;
                const target=button(current?`卡位 ${index+1} · 已上阵`:`上阵卡位 ${index+1}`,()=>{close();options.place(id,index);},'secondary');target.disabled=current;positions.append(target);
            }
            if(options.save.formation.includes(id))positions.append(button('休息',()=>perform({type:'formation',slots:options.save.formation.map(value=>value===id?null:value),heroSlot:options.save.heroSlot}),'secondary'));
            content.append(positions,el('h3','','进化路径'),createPetEvolution(assets,id,pet,portrait,el));
        }else{
            const stages=createPetEvolution(assets,id,pet,portrait,el);
            content.append(stages);
            const count=el('strong',''),pack=el('div','pet-pack-emblem',el('span','','魔法'),el('strong','','卡包'));
            const heading=el('div','pet-deck-heading',pack,count),cards=el('div','pet-spell-shelf');
            const save=button('保存宠物卡包',()=>perform({type:'pet-deck',petId:id,deck:draft}),'primary');
            const controls=[];
            function update(){
                count.textContent=pet?`${total()} / ${petCapacity(pet,assets.content)} 张`:'成长魔法';
                save.disabled=!total();
                for(const control of controls){const amount=draft.find(row=>row.key===control.key)?.count||0;control.number.textContent=String(amount);control.remove.disabled=amount===0;control.add.disabled=control.locked||amount>=p.petCopies||total()>=petCapacity(pet,assets.content);}
            }
            for(const lesson of [...def.lessons].sort((left,right)=>left.level-right.level)){
                const card=assets.dataset.cards[lesson.key],locked=pet&&pet.level<lesson.level;
                const item=el('article',`pet-spell-item${locked?' is-locked':''}`);
                if(card)item.append(spellFace?spellFace(assets,card):createCardFace({el,name:card.name||lesson.key,cost:card.pipcost,cooldown:assets.content.items[card.itemId]?.stats?.[186]||0,description:card.description||'',draw:context=>assets.skillArt.drawCard(context,card,{name:card.name||lesson.key})}));
                else item.append(el('strong','',lesson.key));
                item.append(el('small','',`${lesson.level}级${locked?'解锁':''}`));
                if(pet){
                    const number=el('output','');
                    const change=delta=>{const amount=draft.find(row=>row.key===lesson.key)?.count||0;draft=draft.filter(row=>row.key!==lesson.key);if(amount+delta>0)draft.push({key:lesson.key,count:amount+delta});update();};
                    const remove=button('−',()=>change(-1),'pet-card-step'),add=button('+',()=>change(1),'pet-card-step');
                    remove.setAttribute('aria-label',`减少${card?.name||lesson.key}`);add.setAttribute('aria-label',`增加${card?.name||lesson.key}`);
                    controls.push({key:lesson.key,number,remove,add,locked});item.append(el('div','pet-card-counter',remove,number,add));
                }
                cards.append(item);
            }
            if(pet)heading.append(save);content.append(heading,cards);update();
        }
    }
    tabs.setAttribute('aria-label','宠物详情分类');
    for(const [key,label] of [...(pet?[['care','养成']]:[]),['growth','形态与卡牌']]){const tab=button(label,()=>{active=key;paint();},'secondary');tab.dataset.tab=key;tabs.append(tab);}
    if(pet)body.append(tabs);body.append(content);dialog.append(body);document.body.append(dialog);paint();
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
    dialog.showModal();exit.focus();
}
