import {createPetTraitBadges} from './view_pet_traits.js';
import {applyPetTraitStats,petTraitParams,petHungerMultiplier} from './adventure_pet_traits_core.js';
import {powerPipChanceByLevel} from './combat_formulas_core.js';
import {fill,tr} from './locale_runtime.js';
import {petDisplayScale} from './adventure_pet_interactions_core.js';
import {createCloseButton} from './view_adventure_controls.js';
import { petParams, STAGE_NAMES, petAppearanceStage, petCapacity, petMaxHp, FOOD_ID, nutritionStock } from './adventure_pets_core.js';
import { createCardFace } from './view_adventure_card.js';
import { createPetEvolution } from './view_adventure_pet_status.js';
// A native nested dialog keeps the shop filters, page and scroll position intact.
export function showPetDetails(assets,id,portrait,{el,button,spellFace},options={}) {
    const speciesId=options.save?.pets[id]?.speciesId||id,def=assets.content.pets[speciesId];
    const trigger=document.activeElement,dialog=el('dialog','modal pet-growth-modal');
    dialog.setAttribute('aria-label',`${def.name} · ${def.staticAppearance?'形象与卡片':'四阶段与卡片'}`);
    const close=()=>dialog.close();
    const exit=createCloseButton(close,'关闭宠物详情');
    const owned=options.save?.pets[id];
    const title=el('h2','pet-profile-title',def.name);
    if(owned)title.append(el('span','pet-profile-level',fill(`{v0}级`,{v0:String(owned.level)}).text));
    dialog.append(el('header','modal-header',el('div','',el('p','eyebrow','宠物图鉴 · 成长与魔法'),title),exit));
    dialog.classList.add('pet-profile-modal');
    const body=el('div','modal-body'),tabs=el('nav','pet-profile-tabs'),content=el('div','pet-profile-content');
    const p=petParams(assets.content),pet=options.save?.pets[id];
    let draft=pet?.deck.map(row=>({...row}))||[],active=pet?'care':'growth';
    const total=()=>draft.reduce((sum,row)=>sum+row.count,0);
    const perform=action=>{close();options.action(action);};
    const selectAppearance=pet&&options.action&&!options.save.pendingEncounter&&!def.staticAppearance?stage=>{
        if(options.action({type:'pet-appearance',petId:id,stage})===false)return;
        paint();content.querySelector('.pet-growth-stage[aria-pressed="true"]')?.focus({preventScroll:true});
    }:undefined;
    function paint(){
        content.replaceChildren();
        for(const tab of tabs.children){const selected=tab.dataset.tab===active;tab.setAttribute('aria-pressed',String(selected));}
        if(active==='care'){
            const stage=petAppearanceStage(pet,assets.content),info=el('div','pet-profile-info'),vitals=el('div','pet-profile-vitals');
            info.append(el('p','',fill('累计获得 {count} 次 · 成功捕获 {captures} 次',{count:pet.obtainedCount??1,captures:pet.captureCount||0}).text),createPetTraitBadges(pet.passiveTraits,assets.content,el),el('p','muted',fill('上阵食量：每分钟 {food} 饱食',{food:(p.hungerPerMinute*petHungerMultiplier(pet,assets.content)).toFixed(2)}).text));
            info.append(el('h3','',def.staticAppearance?fill(`{v0}系 · 原版形象`,{v0:String(def.traits.elementalAttribute)}).text:fill(`{v0}系 · {v1}`,{v0:String(def.traits.elementalAttribute),v1:String(STAGE_NAMES[stage])}).text));
            for(const [label,value,max] of [['生命',pet.hp,petMaxHp(pet,assets.content)],['饱食',pet.hunger,100]]){
                const text=fill('{label} {value} / {max}',{label,value:Math.floor(value),max}).text;
                const meter=el('progress',`pet-meter pet-meter-${label==='饱食'?'hunger':'hp'}`);meter.max=max;meter.value=value;meter.setAttribute('aria-label',text);
                vitals.append(el('label','pet-stat',el('span','',text),meter));
            }
            const formation=options.save.formation||[],deployed=formation.includes(id),empty=formation.findIndex(slot=>!slot);
            const positions=el('div','pet-position-actions');
            const toggle=button(deployed?'下阵':'上阵',()=>{
                if(options.save.pendingEncounter||(!deployed&&empty<0))return;
                const slots=deployed?formation.map(value=>value===id?null:value):[...formation];
                if(!deployed)slots[empty]=id;
                perform({type:'formation',slots,heroSlot:options.save.heroSlot});
            },deployed?'secondary':'primary');
            toggle.disabled=!!options.save.pendingEncounter||(!deployed&&empty<0);
            toggle.title=tr(options.save.pendingEncounter?'战斗中无法调整阵容':deployed?'从阵容中休息':empty<0?'阵容已满':'上阵到下一个空位');
            const feed=button(fill(`分享营养餐 · 消耗 1 份（剩余 {v0}）`,{v0:String(nutritionStock(options.save))}).text,()=>perform({type:'pet-feed',petId:id}),'primary');
            feed.disabled=!!options.save.pendingEncounter||!(nutritionStock(options.save)>0);
            positions.append(toggle,feed);info.append(positions);
            if(pet.gender)info.append(el('p','muted',fill(`{v0} · 记住 {v1} 位伙伴{v2}`,{v0:String(pet.gender==='male'?'公':'母'),v1:String(pet.memories.length),v2:String(pet.cooldownUntil>Date.now()?' · 繁育冷却中':'')}).text));
            if(pet.hunger===0)info.append(el('p','pet-supply-notice','饥饿中 · 已暂停自然回血'));
            if(!(nutritionStock(options.save)>0))info.append(button('购买营养餐',()=>{close();options.shop();},'secondary'));
            // Display progress within the current level, using the existing
            // petXpLevel triangular thresholds (BalanceParams.petXpStep).
            const capped=pet.level>=p.levelCap,base=p.petXpStep*pet.level*(pet.level-1)/2;
            const needed=p.petXpStep*pet.level,earned=Math.max(0,Math.min(needed,pet.xp-base));
            const experience=el('progress','pet-meter pet-meter-xp');
            experience.max=capped?1:needed;experience.value=capped?1:earned;
            const xpLabel=capped?'经验 · 已满级':fill(`经验 {v0} / {v1}`,{v0:String(earned),v1:String(needed)}).text;
            experience.setAttribute('aria-label',xpLabel);experience.title=fill(`累计经验 {v0}`,{v0:String(pet.xp)}).text;
            const xp=el('label','pet-profile-xp',experience,el('span','',xpLabel));
            const portraitColumn=el('div','pet-profile-visual',vitals,el('div','pet-profile-portrait',portrait(assets,speciesId,stage,180*petDisplayScale(pet,assets.content))),xp);
            content.append(el('div','pet-profile-overview',portraitColumn,info));
            // Use the same permanent stat projection as independent party pets.
            const stats=applyPetTraitStats({},pet.passiveTraits,petTraitParams(assets.content));
            const attributes=el('dl','pet-profile-attributes');
            const percent=value=>`${Number(value.toFixed(2))}%`;
            for(const [label,value] of [
                ['最大生命',String(petMaxHp(pet,assets.content))],
                ['攻击力（伤害加成）',percent(stats.damagePct.all||0)],
                ['防御力（减伤）',percent(stats.resistPct.all||0)],
                ['暴击属性',percent(stats.critPct.all||0)],
                ['命中加成',percent(stats.accuracyPct.all||0)],
                ['超级魔力率',percent(Math.min(100,powerPipChanceByLevel(pet.level,'kids')+stats.powerPipPct))],
                ['治疗加成',percent(stats.outputHealPct)],
                ['卡包容量',fill('{count} 张',{count:petCapacity(pet,assets.content)}).text],
            ])attributes.append(el('div','pet-profile-attribute',el('dt','',label),el('dd','',value)));
            content.append(el('section','pet-profile-combat',el('h3','','基础战斗属性'),attributes,
                el('p','muted','已计入等级与标签，不含战斗临时效果。攻击力是卡牌伤害的额外加成，0%仍可造成伤害；命中与暴击还受卡牌和对手影响。')));
            content.append(el('h3','',def.staticAppearance?'形象':'进化路径'),createPetEvolution(assets,speciesId,pet,portrait,el,selectAppearance));
        }else{
            const stages=createPetEvolution(assets,speciesId,pet,portrait,el,selectAppearance);
            content.append(stages);
            const count=el('strong',''),pack=el('div','pet-pack-emblem',el('span','','魔法'),el('strong','','卡包'));
            const heading=el('div','pet-deck-heading',pack,count),cards=el('div','pet-spell-shelf');
            const save=button('保存宠物卡包',()=>perform({type:'pet-deck',petId:id,deck:draft}),'primary');
            const controls=[];
            function update(){
                count.textContent=pet?fill(`{v0} / {v1} 张`,{v0:String(total()),v1:String(petCapacity(pet,assets.content))}).text:'成长魔法';
                save.disabled=!total();
                for(const control of controls){const amount=draft.find(row=>row.key===control.key)?.count||0;control.number.textContent=String(amount);control.remove.disabled=amount===0;control.add.disabled=control.locked||amount>=p.petCopies||total()>=petCapacity(pet,assets.content);}
            }
            for(const lesson of [...def.lessons].sort((left,right)=>left.level-right.level)){
                const card=assets.dataset.cards[lesson.key],locked=pet&&pet.level<lesson.level;
                const item=el('article',`pet-spell-item${locked?' is-locked':''}`);
                if(card)item.append(spellFace?spellFace(assets,card):createCardFace({el,name:card.name||lesson.key,cost:card.pipcost,cooldown:assets.content.items[card.itemId]?.stats?.[186]||0,description:card.description||'',draw:context=>assets.skillArt.drawCard(context,card,{name:card.name||lesson.key})}));
                else item.append(el('strong','',lesson.key));
                item.append(el('small','',fill(`{v0}级{v1}`,{v0:String(lesson.level),v1:String(locked?'解锁':'')}).text));
                if(pet){
                    const number=el('output','');
                    const change=delta=>{const amount=draft.find(row=>row.key===lesson.key)?.count||0;draft=draft.filter(row=>row.key!==lesson.key);if(amount+delta>0)draft.push({key:lesson.key,count:amount+delta});update();};
                    const remove=button('−',()=>change(-1),'pet-card-step'),add=button('+',()=>change(1),'pet-card-step');
                    remove.setAttribute('aria-label',fill(`减少{v0}`,{v0:String(card?.name||lesson.key)}).text);add.setAttribute('aria-label',fill(`增加{v0}`,{v0:String(card?.name||lesson.key)}).text);
                    controls.push({key:lesson.key,number,remove,add,locked});item.append(el('div','pet-card-counter',remove,number,add));
                }
                cards.append(item);
            }
            if(pet)heading.append(save);content.append(heading,cards);update();
        }
    }
    tabs.setAttribute('aria-label','宠物详情分类');
    for(const [key,label] of [...(pet?[['care','养成']]:[]),[ 'growth', def.staticAppearance?'卡牌':'形态与卡牌']]){const tab=button(label,()=>{active=key;paint();},'secondary');tab.dataset.tab=key;tabs.append(tab);}
    if(pet)body.append(tabs);body.append(content);dialog.append(body);document.body.append(dialog);paint();
    dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();close();}});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
    dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});
    dialog.showModal();exit.focus();
}
