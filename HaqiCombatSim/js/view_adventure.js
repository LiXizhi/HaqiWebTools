import {renderLearningMode} from './view_learning_mode.js';
import {createHeroPicker} from './view_hero_picker.js';
import {dungeonFor} from './adventure_dungeons_core.js';
import {heroPortrait} from './hero_renderer.js';
import {renderNpcServices} from './view_adventure_npc.js';
import {npcServices} from './adventure_npc_core.js';
import {renderGems} from './view_adventure_gems.js';
import {renderMembership} from './view_adventure_membership.js';
import {createCloseButton} from './view_adventure_controls.js';
import {attachStatusTooltips} from './view_adventure_status_tooltip.js';

import {renderQuestJournal,translatedGoal,rewardChip} from './view_adventure_quests.js';
import { islandName } from './adventure_world_map_core.js';
import { drawSchoolIcon } from './card_renderer.js';
import { renderWorldMap } from './view_adventure_world_map.js';
import { castBlockedMessage } from './adventure_cast_feedback_core.js';
import { createCardFace } from './view_adventure_card.js';
import {describeCard} from './card_description_core.js';
import { renderDeckEditor } from './view_adventure_deck.js';
import { bindDialogue } from './view_adventure_dialogue.js';
import { bindHandGesture } from './view_adventure_hand.js';
import { validTargets } from './combat_arena_core.js';
import { createBattleRoster,updateBattleRoster } from './view_adventure_battle_status.js';
export { updateBattleRoster } from './view_adventure_battle_status.js';
import { specMaxHp } from './adventure_pets_core.js';
import { checkinStatus } from './adventure_checkin_core.js';
import { playerSpec } from './adventure_core.js';
import { renderDebugEditor } from './view_adventure_debug.js';
import { renderPetCollection,starterPicker,petPortrait } from './view_adventure_pets.js';
import { renderShop } from './view_adventure_shop.js';
// DOM rendering and input bindings. Actions go to the adventure_app controller.
import { currentQuest,questState,questReady,questProgress,pendingQuestTalk,SCHOOL_NAMES,rewardsFor,deckLimits,recommendedDeck,catalogStatSnapshot,teachingMode } from './adventure_core.js';
import {catalogGoalRows,catalogQuestReady,catalogQuestsForNpc,catalogQuestStatus,trackedQuestIds} from './adventure_catalog_quests_core.js';
import * as U from './combat_unit_core.js';
import { cardTargetKind } from './combat_cards_core.js';
import { renderEquipment } from './view_adventure_equipment.js';
import { renderStrengthening } from './view_adventure_strengthening.js';
import { COLORS } from './adventure_renderer.js';
import { battleChallengeBar } from './view_language_learning.js';
import { renderSettings, settingsView } from './view_adventure_settings.js';
export { settingsView } from './view_adventure_settings.js';
import { createSettingsControls } from './view_settings_controls.js';
import { tr, setText, fill } from './locale_runtime.js';
import { syncLocaleChrome,dialogueLearningLines } from './locale.js';
export function el(tag,cls,...children) {
    const n=document.createElement(tag);if(cls)n.className=cls;
    const sources=[];
    for(const child of children.flat(Infinity)){
        if(child===null||child===undefined||child===false)continue;
        if(child instanceof Node)n.append(child);
        else {const source=String(child);sources.push(source);n.append(document.createTextNode(tr(source)));}
    }
    if(sources.length===1&&n.childNodes?.length===1&&n.childNodes[0].nodeType===3&&n.dataset)n.dataset.zh=sources[0];
    return n;
}
export function button(label,fn,cls='') {const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;}
// Shared disabled overlay for the mount and bilingual-learning controls.
function disabledModeMark(){
    const stop=el('span','mount-emoji-stop');
    stop.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#6f6f6f" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="11.3"/><path d="M4 4l16 16"/></svg>';
    return stop;
}

const paths={book:'M4 4h6q2 0 2 2q0-2 2-2h6v15h-6q-2 0-2 2q0-2-2-2H4z M12 6v15',cards:'M5 5h12v15H5z M8 2h12v15',bag:'M5 8h14v12H5z M8 8V5a4 4 0 0 1 8 0v3',pet:'M8 13q4-5 8 0q6 7-4 6q-10 1-4-6 M5 6v3 M10 3v4 M15 3v4 M20 6v3',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',sound:'M4 10h4l5-5v14l-5-5H4z M17 8q5 4 0 8',arrow:'M5 12h14 M13 6l6 6-6 6'};
paths.gourd='M10 2h4v3c4 1 4 6 1 8 7 3 6 9-3 9S2 16 9 13C6 11 6 6 10 5z M8 13h8 M14 12l5 4';
paths.dungeon='M3 21V9h4V5h3V3h4v2h3v4h4v12H3 M9 21v-7a3 3 0 0 1 6 0v7 M5 12v2 M19 12v2';
paths.cloud='M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10 M12 20V10 M8 14l4-4 4 4';
paths.close='M6 6l12 12 M18 6L6 18';
paths.shop='M3 9l2-6h14l2 6 M3 9v3h18V9 M5 12v9h14v-9 M9 21v-6h6v6';
// 坐骑名称 → emoji：关键词按从具体到一般排序（如“狼蛛”先于“狼”），未命中回落为抱抱龙 🐲。
const mountEmojiKeys=[['狼蛛','🕷️'],['机器人','🤖'],['雪地车','🚙'],['南瓜车','🎃'],['飞毯','🪄'],['扫帚','🧹'],['凤凰','🦅'],['鹰','🦅'],['羽','🪶'],['龙','🐲'],['虎','🐯'],['狼','🐺'],['马','🐎'],['驹','🐎'],['龟','🐢'],['海豚','🐬'],['鲨','🦈'],['鲸','🐳'],['猛犸','🦣'],['狐','🦊'],['兔','🐰'],['象','🐘'],['鹿','🦌'],['鸵鸟','🦤'],['鼠','🐭'],['牛','🐂'],['蛇','🐍'],['羊','🐑'],['猴','🐒'],['鸡','🐔'],['狗','🐶'],['猪','🐷'],['鸟','🐦'],['车','🚗']];
function mountEmoji(name) {const text=String(name||'');return (mountEmojiKeys.find(([key])=>text.includes(key))||[])[1]||'🐲';}
function icon(kind) {const span=el('span','icon');span.dataset.uiIcon=kind;span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]||paths.book}"/></svg>`;return span;}
function art(assets,ref,w=76,h=90,cls='') {
    const tall=ref?.fit==='height';
    const c=el('canvas',`art ${cls}${tall?' portrait-height':''}`);
    // Height-fit portraits need a wider bitmap so wing tips are drawn, then CSS lets them overflow the slot.
    const bw=tall?Math.ceil(h*2*1.75):w*2,bh=h*2;
    c.width=bw;c.height=bh;c.style.width=`${bw/2}px`;c.style.height=`${h}px`;
    assets.draw(c.getContext('2d'),ref,0,0,c.width,c.height);return c;
}
function tile(assets,sheet,index,w=90,h=95) {if(sheet==='sprites'&&index>=8&&index<16)return heroPortrait(assets,{appearance:index>=12?'girl':'boy'},w,h,{facing:index%4});const c=el('canvas','art');c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.tile(c.getContext('2d'),sheet,index,0,0,c.width,c.height);return c;}
function badge(text,cls=''){return el('span',`badge ${cls}`,text);}
const schoolDescription={fire:'火焰与持续伤害，点燃你的热情。',ice:'坚固的护盾与寒冰魔法，稳步迎战。',storm:'强力的单体攻击，让雷霆为你而鸣。',life:'治疗与自然的力量，守护生命。',death:'吸取生命、布下陷阱，掌握幽暗魔法。'};
export function renderEntry(root,assets,stored,cb,error='') {
    const draft=cb.draft||{name:'小哈奇',school:'fire',appearance:'boy',starter:'dragon_green',step:1};
    root.replaceChildren();root.className='entry-screen entry-wizard';
    const intro=el('div','entry-intro',el('p','eyebrow','魔法哈奇 · 第一章'),el('h1','game-title','魔法哈奇'),el('div','title-rule'),el('h2','chapter-title','初心之旅'),el('p','entry-description','选一门魔法，遇见你的伙伴。\n从这里，开始一段新的旅程。'));
    intro.append(button(cb.owner?'我的云端旅途':'登录 Keepwork',cb.login||cb.cloud,'secondary cloud-entry-button'));
    // 首页可直接切换界面语言；控制器切换后整页重绘，无需本视图自行刷新。
    if(cb.setLocale&&cb.locale)intro.append(el('div','entry-locale',el('span','entry-locale-label','界面语言'),createSettingsControls({el,button}).localeSelector(cb.locale,cb.setLocale)));
    const form=el('form','character-form creation-form');
    root.append(el('div','entry-layout',intro,form));
    function paint() {
        cb.stopPreview?.();form.replaceChildren();root.classList.toggle('school-step',draft.step===3);root.classList.toggle('companion-step',draft.step===2);
        const steps=el('div','creation-steps');
        for(const [index,label]of ['起名字','选择抱抱龙','选择系别'].entries()){
            if(index)steps.append(el('i',''));
            // 序号与标签分开传入，让 tr() 只查标签本身，避免「01 起名字」整串无法命中词典。
            const item=el('span',draft.step===index+1?'current':draft.step>index+1?'done':'',`0${index+1} `,label);
            if(draft.step===index+1)item.setAttribute('aria-current','step');steps.append(item);
        }
        const titles=['你的冒险，从名字开始','选择你的抱抱龙','找到属于你的魔法'];
        const captions=['先选一个模样，再告诉我们你的名字。','选一位伙伴，陪你踏上魔法旅程。','点击系别，看看它的代表技能。喜欢的话，就选它吧。'];
        form.append(steps,el('h2','',titles[draft.step-1]),el('p','creation-caption',captions[draft.step-1]));
        if(draft.step===1) {
            const preview=createHeroPicker(assets,draft);
            const name=el('input','name-input');name.id='hero-name';name.name='name';name.value=draft.name;name.maxLength=16;name.autocomplete='off';name.required=true;name.oninput=()=>{draft.name=name.value;};
            const label=el('label','field-label','你的名字');label.htmlFor=name.id;
            form.append(preview,label,name);
        } else if(draft.step===2) {
            const scene=el('div','companion-scene');
            const hero=el('div','companion-hero',heroPortrait(assets,draft,100,120),el('span','companion-name',draft.name));
            const companion=el('div','companion-position');
            const greeting=el('p','companion-greeting');greeting.setAttribute('role','status');
            scene.append(el('span','companion-scene-label','魔法营地 · 初次相遇'),el('div','companion-clearing'),hero,companion);
            const meet=(id,animate)=>{
                const pet=petPortrait(assets,id,0,82),runner=el('div',`companion-runner${animate?' arriving':''}`,pet);
                companion.replaceChildren(runner);
                setText(greeting,'{name}，以后就一起冒险吧。',{name:assets.content.pets[id].name});
                scene.setAttribute('aria-label',fill('{hero}和{pet}站在一起',{hero:draft.name,pet:assets.content.pets[id].name}).text);
            };
            const picker=starterPicker(assets,id=>{draft.starter=id;meet(id,true);},{el,button});
            for(const b of picker.children){const selected=b.dataset.petId===draft.starter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
            meet(draft.starter,false);
            form.append(scene,greeting,el('p','companion-invitation','点一点，让喜欢的伙伴来到你身边。'),picker);
        } else {
            const schools=el('div','school-choices');
            for(const [key,label]of Object.entries(SCHOOL_NAMES)){
                const b=button([el('i','school-gem'),el('span','',label)],()=>{draft.school=key;draft.previewKey=null;paint();},`school-choice ${draft.school===key?'selected':''}`);
                b.dataset.school=key;b.style.setProperty('--school',COLORS[key]);b.setAttribute('aria-pressed',String(draft.school===key));schools.append(b);
            }
            const canvas=el('canvas','creation-preview');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill('{school}系技能动画预览',{school:SCHOOL_NAMES[draft.school]}).text);
            const status=el('p','preview-status','正在准备技能演出…');status.setAttribute('role','status');
            const choices=cb.previewChoices(draft.school),cards=el('div','creation-skill-choices');
            if(!choices.some(c=>c.key===draft.previewKey))draft.previewKey=choices[0]?.key;
            let pause;
            const play=(key,automatic=false)=>{draft.previewKey=key;for(const b of cards.children){const on=b.dataset.key===key;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}setText(pause,'暂停');if(!cb.busy)cb.preview(canvas,key,{appearance:draft.appearance,headId:draft.headId},text=>{setText(status,text);},automatic?()=>{const index=choices.findIndex(c=>c.key===key);play(choices[(index+1)%choices.length].key,true);}:undefined);};
            for(const choice of choices){
                const face=el('canvas','creation-skill-card');face.width=112;face.height=112;face.setAttribute('aria-hidden','true');
                const base=assets.effects.cards[choice.key]?.base;
                if(base)assets.skillArt.ensure(base).then(()=>{if(face.isConnected)assets.skillArt.drawSubject(face.getContext('2d'),base,0,0,112,112);}).catch(()=>{});
                const b=button([face,el('span','',choice.name)],()=>play(choice.key),'creation-skill-option');b.dataset.key=choice.key;cards.append(b);
            }
            pause=button('暂停',()=>{setText(pause,cb.pausePreview()?'继续播放':'暂停');},'text-button');
            form.append(schools,el('p','school-description',schoolDescription[draft.school]),canvas,
                el('div','preview-controls',status,button('重播',()=>play(draft.previewKey),'text-button'),pause),cards,
                el('p','creation-preview-note','代表技能演示，需在冒险中逐步学习。'));
            if(draft.previewKey)play(draft.previewKey,true);
        }
        const submit=el('button','primary begin-button');submit.type='submit';
        if(cb.busy)setText(submit,cb.busy);
        else if(draft.step===1)setText(submit,'下一步 · 选择抱抱龙');
        else if(draft.step===2)setText(submit,'下一步 · 选择系别');
        else setText(submit,'确认选择{school} · 开始冒险',{school:SCHOOL_NAMES[draft.school]});
        form.append(submit);
        if(draft.step===1)form.append(button('导入魔法哈奇角色',cb.importOriginal,'text-button creation-import'));
        if(draft.step>1)form.append(button('上一步',()=>{draft.step--;paint();root.scrollTop=0;},'text-button creation-back'));
        if(cb.roles)form.append(button('返回我的角色',cb.roles,'text-button creation-back'));
        if(error){const status=el('p','error-text',error);status.setAttribute('role','alert');form.append(status);}
        if(cb.busy)for(const node of root.querySelectorAll('button,input'))node.disabled=true;
    }
    form.onsubmit=e=>{e.preventDefault();if(cb.busy)return;if(draft.step<3){draft.name=draft.name.trim()||'小哈奇';draft.step++;paint();root.scrollTop=0;}else cb.create({name:draft.name,school:draft.school,appearance:draft.appearance,headId:draft.headId,starter:draft.starter});};
    paint();
}
function withName(pattern, name) {
    return tr(pattern).replaceAll('{name}', tr(name ?? ''));
}
export function objectiveLabel(g,c) {
    if(g.kind==='talk')return withName('与{name}交谈', c.npcs[g.id]?.name||String(g.id));
    if(g.kind==='defeat')return withName('击败{name}', Object.values(c.monsters).find(m=>m.goalId===g.id)?.name||'训练敌人');
    return ({79016:'强化一件装备（点击追踪进入强化）',79019:'喂养你的宠物',79037:'装备翡翠口袋并保存配卡','hatch-pet':'打开出奇蛋，获得宠物','equip-staff':'装备晶石法杖'})[g.id]||'完成导师的指导';
}
// 每帧同步教学指针：自动寻路（点过追踪）期间隐藏手指与按钮脉冲，寻路结束由下一次 HUD 渲染重新判定。
export function syncTeachPointer(root,walking) {
    const hand=root.querySelector('.teach-pointer');if(!hand)return;
    hand.hidden=walking;
    root.querySelector('.track-button.teach-target')?.classList.toggle('teach-walk',walking);
}
export function updateHeroHealth(root,save,content) {    const bar=root.querySelector('.hero-health');if(!bar)return;
    const maxHp=specMaxHp(playerSpec(save,content)),hp=Math.max(0,Math.min(maxHp,Math.floor(save.heroHp??maxHp)));
    bar.style.setProperty('--health',`${maxHp>0?hp/maxHp*100:0}%`);
    bar.querySelector('.hero-health-label').textContent=`${hp} / ${maxHp}`;
    bar.setAttribute('aria-label',fill('生命 {hp} / {max}',{hp,max:maxHp}).text);
}
function minutesLeft(ms){return Math.max(1,Math.ceil((ms-1)/60000));}
function gourdArt(){
    const art=el('span','gourd-art');
    art.innerHTML='<svg viewBox="0 0 80 112" aria-hidden="true"><ellipse cx="40" cy="104" rx="25" ry="5" fill="#685225" opacity=".15"/><path d="M35 8h10l-2 12c17 4 21 23 9 34 26 13 23 47-12 47S2 67 28 54C16 43 20 24 37 20z" fill="currentColor" stroke="#8f621f" stroke-width="2.5"/><path d="M29 33c-6 8-3 14 0 17M23 71c-6 11-1 19 5 22" fill="none" stroke="#fff4b6" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M27 54q13 6 26 0l-1 7q-12 5-24 0z" fill="#af4e32"/><path d="m46 60 12 19-9-3-3 8-7-23" fill="#af4e32"/><path d="M33 8h14v7H33z" fill="#826035"/><circle cx="38" cy="79" r="10" fill="#fff0b5" opacity=".85"/><text x="38" y="83" text-anchor="middle" font-size="12" fill="#8f621f">福</text></svg>';
    return art;
}
export function updateCheckin(root,model) {
    const status=checkinStatus(model.save,model.assets.content,model.now??Date.now(),model.membership);
    const nav=root.querySelector('.checkin-button');
    const navLabel=nav?.querySelector('small');
    if(nav&&navLabel){
        if(status.ready)setText(navLabel,'可领取');
        else if(status.finished)setText(navLabel,'已领完');
        else setText(navLabel,'{minutes} 分钟',{minutes:minutesLeft(status.remainingMs)});
        nav.classList.toggle('reward-ready',status.ready);
    }
    const grid=root.querySelector('.checkin-gourds');if(!grid)return;
    for(const g of status.gourds){
        const card=grid.children[g.index],b=card.querySelector('.gourd-base'),vip=card.querySelector('.gourd-vip');
        b.disabled=!g.ready;card.classList.toggle('ready',g.ready||g.vipReady);card.classList.toggle('claimed',g.claimed&&(!status.starLevel||g.vipClaimed));
        setText(card.querySelector('.gourd-time'),'{minutes} 分钟',{minutes:g.minute});
        const names=g.rewards.map(r=>fill('{name} × {count}',{name:model.assets.content.items[r.id]?.name||r.id,count:r.count}).text);
        card.querySelector('.gourd-coins').textContent=names[0]||'';
        card.querySelector('.gourd-items').textContent=names.slice(1).join(tr('、'));
        if(g.claimed)setText(b,'已领取');
        else if(g.ready)setText(b,'领取奖励');
        else setText(b,'还需 {minutes} 分钟',{minutes:minutesLeft(g.remainingMs)});
        b.setAttribute('aria-label',fill('{minute}分钟葫芦：{label}',{minute:g.minute,label:b.textContent}).text);
        card.title=names.join(tr('、'));
        if(g.vipClaimed)setText(vip,'魔法星已领取');
        else if(!status.starLevel)setText(vip,'魔法星额外奖励');
        else if(g.vipReady)setText(vip,'再领 {count} 仙豆',{count:g.vipCoins});
        else setText(vip,'魔法星奖励待解锁');
        vip.disabled=g.vipClaimed||(status.starLevel>0&&!g.vipReady);
        vip.setAttribute('aria-label',fill('{minute}分钟葫芦：{label}',{minute:g.minute,label:vip.textContent}).text);
    }
    setText(root.querySelector('.checkin-online'),'今日累计在线 {minutes} 分钟 · 普通奖励 {base}/5 · 魔法星奖励 {vip}/5',{minutes:Math.floor(status.onlineMs/60000),base:status.baseCount,vip:status.vipCount});
    setText(root.querySelector('.checkin-balance'),'当前拥有 {count} 仙豆',{count:model.save.inventory[17213]||0});
    if(status.starLevel)setText(root.querySelector('.checkin-member-summary'),'魔法星 {level} 级：每个葫芦额外 {count} 仙豆',{level:status.starLevel,count:status.gourds[0].vipCoins});
    else setText(root.querySelector('.checkin-member-summary'),'普通奖励人人可领，拥有魔法星可再领一份额外仙豆。');

}
function trackerEntries(save,c) {
    const ids=trackedQuestIds(save).filter(id=>c.quests.some(quest=>quest.id===id)||c.catalogQuests?.byId[id]);
    if(ids.length)return ids.map(id=>({id,pinned:true}));
    const quest=currentQuest(save,c);
    return quest?[{id:quest.id,pinned:false}]:[];
}
function chapterTrackLines(save,c,quest) {
    const state=questState(save,quest.id);
    if(!state.accepted)return [{text:withName('去找{name}，接取新的任务。', c.npcs[quest.startNpc].name)}];
    if(questReady(save,quest))return [{text:withName('任务已完成，向{name}回报。', c.npcs[quest.endNpc].name)}];
    return questProgress(save,quest).map(goal=>({text:objectiveLabel(goal,c),done:goal.value>=goal.count}));
}
function catalogTrackLines(save,c,quest) {
    const snap=catalogStatSnapshot(save,c),state=questState(save,quest.id),ready=catalogQuestReady(save,c,quest,snap);
    if(!state.accepted){const name=c.npcs[quest.startNpc]?.name;return [{text:name?withName('去找{name}，接取新的任务。', name):'接取这个任务。'}];}
    if(ready){const name=c.npcs[quest.endNpc]?.name;return [{text:name?withName('任务已完成，向{name}回报。', name):'任务已完成，可以交付。'}];}
    const goals=catalogGoalRows(save,c,quest,snap);
    if(!goals.length)return [{text:'与居民交谈后即可交付。'}];
    return goals.map(goal=>({text:translatedGoal(goal),done:goal.value>=goal.count}));
}
function appendTrackerQuest(tracker,entry,save,c,cb,teach) {
    const chapter=c.quests.find(quest=>quest.id===entry.id),quest=chapter||c.catalogQuests.byId[entry.id];
    const ready=chapter?questReady(save,quest):catalogQuestReady(save,c,quest,catalogStatSnapshot(save,c));
    const state=questState(save,quest.id);
    // 魔法营地教学模式（2026-09-26 用户约定）：不看等级，身处营地即开启；新手岛整套任务
    // （未接取、进行中、可交付）都持续用指针引导点击"追踪"，直到该任务完成交付才消失；
    // 点过之后进入自动寻路（model.autoWalk）期间隐藏。
    const campQuest=chapter?c.npcs[quest.startNpc]?.zone==='camp':quest.region==='camp';
    const teachNow=teach.allow&&campQuest&&!state.claimed;
    if(teachNow)teach.allow=false;
    const statusLabel=chapter?(ready?'可以交付':state.accepted?'进行中':'可接取'):catalogQuestStatus(save,c,quest,catalogStatSnapshot(save,c));
    const marker=el('span',`quest-state ${ready?'ready':state.accepted?'active':'available'}`,ready?'?':'!');marker.setAttribute('aria-hidden','true');
    const questLink=button([marker,el('span','quest-title',quest.title)],()=>cb.panel('quests',{questId:quest.id}),'quest-track-title');
    questLink.title=fill('{status}，点击查看任务详情',{status:statusLabel}).text;questLink.setAttribute('aria-label',fill('{title}，{status}，查看任务详情',{title:quest.title,status:statusLabel}).text);
    const track=button('追踪',()=>cb.track(quest.id,{pin:false}),'track-button');
    track.title='追踪这个任务';
    if(teachNow){
        track.classList.add('teach-target');
        const hand=el('span','teach-pointer','👇');
        hand.setAttribute('aria-hidden','true');
        track.append(hand);
    }
    const card=el('article','tracker-quest',el('h3','',questLink));
    const lines=chapter?chapterTrackLines(save,c,quest):catalogTrackLines(save,c,quest);
    lines.forEach((line,index)=>{
        const text=el('span','tracker-follow-text',line.text);
        const follow=button(line.done===undefined?text:[el('span','tracker-mark',line.done?'✓':'◇'),text],()=>cb.track(quest.id,{pin:false}),`tracker-follow${line.done?' complete':''}`);
        follow.title=tr('追踪这个任务');follow.setAttribute('aria-label',fill('{text}，追踪',{text:line.text}).text);
        card.append(index?follow:el('div','tracker-line',follow,track));
    });
    tracker.append(card);
}
export function renderHud(root,model,cb) {
    const {assets,save}=model,c=assets.content;root.replaceChildren();
    // EXPArea.lua EXPArea.UpdateUI L86-94: cur_value is the experience inside the current level,
    // max_value is nextlevelexp, and the fill is min(cur,max)/max against the grey track. Keeping the
    // current level's band at the level cap keeps the bar two-coloured (progress + remaining track).
    const levels=c.progression.xpThresholds,previous=levels[save.level-1]??save.xp,next=levels[save.level]??save.xp;
    const band=next-previous,ratio=band>0?Math.max(0,Math.min(1,(save.xp-previous)/band)):1;
    const xp=el('div','xp-bar',el('i'));xp.firstChild.style.width=`${(ratio*100).toFixed(2)}%`;
    const school=el('canvas','hero-school-icon');school.width=48;school.height=48;
    school.setAttribute('role','img');const schoolLabel=fill('{school}系',{school:SCHOOL_NAMES[save.school]}).text;school.setAttribute('aria-label',schoolLabel);school.title=schoolLabel;
    drawSchoolIcon(school.getContext('2d'),save.school,24,24,36);
    const level=el('span','hero-level-badge',String(save.level));
    level.dataset.zh='等级';
    level.title=`${tr('等级')} ${save.level}`;
    level.setAttribute('aria-label',level.title);
    // Hidden entry: clicking the character name five times in a row (interval <= 600ms) opens the debug panel; a single click still opens the character & equipment panel.
    let heroClicks=0,heroTimer=0;
    const openHeroPanel=()=>{
        heroClicks++;clearTimeout(heroTimer);
        if(heroClicks>=5){heroClicks=0;cb.panel('debug');return;}
        heroTimer=setTimeout(()=>{heroClicks=0;cb.panel('equipment');},600);
    };
    const name=button([school,level,el('strong','',save.name)],openHeroPanel,'hero-name');name.title='角色与装备（R）';
    const isVip=model.membership?.isVip===true;
    const membership=button(isVip?'会员权益':'升级会员',cb.membership,'hero-membership');
    membership.title=isVip?'会员权益':'升级会员';
    membership.setAttribute('aria-label',membership.title);
    membership.setAttribute('aria-haspopup','dialog');
    const currency=(id,label)=>{
        const amount=(save.inventory[id]||0).toLocaleString('zh-CN');
        const icon=el('canvas','hero-bean-icon');icon.width=32;icon.height=32;icon.setAttribute('aria-hidden','true');
        const art=c.currencyIcons?.[id];
        if(art)assets.draw(icon.getContext('2d'),art,0,0,32,32);
        const node=el('span','hero-currency',icon,el('span','',amount));
        node.dataset.zh=label;
        node.title=`${tr(label)} ${amount}`;
        node.setAttribute('aria-label',node.title);
        return node;
    };
    const details=el('div','hero-details');
    for(const [id,label]of [[100,'奇豆'],[17213,'仙豆'],[984,'魔豆']])details.append(currency(id,label));
    const status=el('section','hero-status',el('div','hero-text',el('div','hero-heading',name,membership),details,xp));
    const warning=el('span','save-indicator',model.storageWarning?'存档未保存':'');warning.hidden=!model.storageWarning;
    status.querySelector('.hero-text').append(el('div','hero-health',el('i'),el('span','hero-health-label')),warning);
    updateHeroHealth(status,save,c);
    root.append(status,el('div','location-label',el('span','',c.worldMaps?.[save.zone]?.name||islandName(save.zone)),el('small','',save.zone==='camp'?'在晨光中，发现魔法':'新的故事，在这里继续')));
    syncLocaleChrome();
    const utilities=el('nav','utility-nav');utilities.setAttribute('aria-label','其他功能');
    const checkin=button([icon('gourd'),el('span','utility-label','签到'),el('small','','')],()=>cb.panel('checkin'),'utility-button checkin-button');
    checkin.title='米酒葫芦 · 在线领奖';
    utilities.append(checkin);
    for(const [label,key,action]of [['世界地图','map',()=>cb.panel('map')],['副本','dungeon',()=>cb.panel('dungeons')],['设置','settings',()=>cb.panel('settings')]])utilities.append(button([icon(key),el('span','utility-label',label)],action,'utility-button'));
    root.append(utilities);

    updateCheckin(root,model);
    const chapterDone=c.quests.filter(quest=>save.quests[quest.id]?.claimed).length;
    const catalogClaimed=c.catalogQuests?.quests.filter(quest=>save.quests[quest.id]?.claimed).length||0;
    const chapterCount=el('span','chapter-count');setText(chapterCount,catalogClaimed?'{done} / 14 · 全岛 {claimed}':'{done} / 14',{done:chapterDone,claimed:catalogClaimed});
    const tracker=el('section','quest-tracker',el('div','tracker-top',el('span','eyebrow','冒险手记'),chapterCount));
    const dungeon=dungeonFor(c,save.zone);
    if(dungeon){
        const cleared=save.dungeonRuns?.[save.zone]?.cleared.length||0,remaining=dungeon.arenas.filter(a=>!a.blocked.length&&!save.dungeonRuns?.[save.zone]?.cleared.includes(a.id)).length;
        tracker.replaceChildren(el('div','tracker-top',el('span','eyebrow','副本探索'),el('span','chapter-count',`${cleared} / ${dungeon.arenas.length}`)),el('h3','',dungeon.name),el('p','',cleared===dungeon.arenas.length?'Boss 已击败，沿路走向出口即可离开。':remaining?'沿道路前进，遇到怪物自动开始战斗。':'前路暂未开放，可在副本菜单暂离。'),el('p','muted','副本中不会自动回血，请用现有生命通关。'),button(remaining?'寻找下一组':'返回出口',cb.track,'track-button'));
    }else{
        const entries=trackerEntries(save,c);
        // 教学模式统一走 adventure_core 的 teachingMode（营地 + 营地任务链未全部交付）；
        // 指针挂在第一条未交付的营地追踪任务上，自动寻路（model.autoWalk）期间不打扰。
        const teach={allow:!!teachingMode(save,c)};
        if(entries.length)for(const entry of entries)appendTrackerQuest(tracker,entry,save,c,cb,teach);
        else tracker.append(el('h3','','新的魔法旅程'),el('p','',save.visitedTown?'你已完成第一章。和镇上的居民聊聊，或到郊外练习魔法吧。':'你通过了毕业考核！前往营地南边的传送阵，探索哈奇小镇。'),button('前往传送阵',cb.track,'track-button'));
    }
    root.append(tracker);
    const nav=el('nav','game-nav');nav.setAttribute('aria-label','游戏菜单');
    for(const [id,label,key]of [['quests','任务','book'],['deck','卡包','cards'],['inventory','背包','bag'],['pet','宠物','pet'],['shop','商店','shop']])nav.append(button([icon(key),el('span','',label)],()=>cb.panel(id),'nav-button'));
    root.append(nav);
    // 坐骑显隐开关：仅漫游场景生效，战斗中恒显示；没有坐骑时不渲染按钮。
    if(save.mountId){
        // 图标用当前坐骑的形象图（c.items 的图集裁剪，同装备栏/宠物栏做法）；无形象数据时回落名称 emoji。
        // 隐藏时叠半透明灰色 SVG 禁止标志（圆圈+斜杠与按钮外圈重合）。
        const mountItem=c.items[save.mountId];
        const mountMark=el('span','mount-mark');
        mountMark.setAttribute('aria-hidden','true');
        mountMark.append(mountItem?.art?art(assets,mountItem.art,34,34):el('span','mount-emoji',mountEmoji(c.mountByItem?.[save.mountId]?.name)));
        if(save.mountHidden){
            mountMark.append(disabledModeMark());
        }
        const mountToggle=button([mountMark],()=>cb.mountToggle(),'mount-toggle');
        mountToggle.title=tr(save.mountHidden?'在场景中显示坐骑':'在场景中隐藏坐骑');
        mountToggle.setAttribute('aria-label',mountToggle.title);
        mountToggle.setAttribute('aria-pressed',String(!save.mountHidden));
        root.append(mountToggle);
        // 与 locale-launch 同一排：英雄卡下方，翻译按钮存在时排在其右侧。
        // root 即 #hud，status 是其内 absolute 子元素，offset 坐标与 hud 同一坐标系。
        const locale=document.querySelector('.locale-launch');
        mountToggle.style.left=`${status.offsetLeft+(locale&&!locale.hidden?44:0)}px`;
        mountToggle.style.top=`${status.offsetTop+status.offsetHeight+8}px`;
    }
    const learningEnabled=save.languageLearning?.enabled===true;
    const learningMark=el('span','mount-mark learning-chat-mark');
    learningMark.setAttribute('aria-hidden','true');
    learningMark.append(el('span','learning-chat-emoji','💬'));
    if(!learningEnabled)learningMark.append(disabledModeMark());
    const learn=button([learningMark],()=>cb.panel('learning-mode'),'mount-toggle learning-mode-launch');
    learn.title=tr(learningEnabled?'双语学习 · 已开启':'双语学习 · 已关闭');
    learn.setAttribute('aria-label',learn.title);
    learn.setAttribute('aria-pressed',String(learningEnabled));root.append(learn);
    const localeControl=document.querySelector('.locale-launch');
    learn.style.left=`${status.offsetLeft+(localeControl&&!localeControl.hidden?44:0)+(save.mountId?44:0)}px`;
    learn.style.top=`${status.offsetTop+status.offsetHeight+8}px`;
    const interaction=button('交谈',cb.interact,'interact-button');interaction.id='interact';interaction.hidden=true;root.append(interaction);
}
function modal(root,title,subtitle,cb,wide=false) {
    root.replaceChildren();root.className='overlay visible';
    const box=el('section',`modal ${wide?'wide':''}`);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    const close=createCloseButton(cb.close);
    box.append(el('header','modal-header',el('div','',el('p','eyebrow',subtitle),el('h2','',title)),close));const body=el('div','modal-body');box.append(body);root.append(box);
    return body;
}
function spellHint(card,d) {
    return describeCard(card,{dataset:d,translate:tr}).summary;
}
function spellFace(assets,card,artCard=card) {
    // kids pe_item.DrawCardMask: 151×230, pips (120,5), cooldown (7,115), description (18,142).
    // Shared background + generated subject; title/numbers/description stay dynamic.
    const cost=card.pipcost===114||card.pipcost==='X'||Number(card.pipcost)<0?'X':String(card.pipcost);
    const rounds=card.params.cooldown??0;
    const description=spellHint(card,assets.dataset);
    return createCardFace({el,name:artCard.name,cost,cooldown:rounds,description,
        draw:context=>assets.skillArt.drawCard(context,card,{name:artCard.name,cooldown:rounds,description})});
}
export function renderPanel(root,kind,model,cb) {
    const {assets,save}=model,c=assets.content,d=assets.dataset;
    if(kind==='membership'){
        const body=modal(root,'魔法星','',cb,true);
        renderMembership(body,model,cb,{el,button,spellFace});
        return;
    }
    if(kind==='gems'){
        const body=modal(root,'宝石镶嵌精工坊','',cb,true);
        renderGems(body,model,cb,{el,button,art});return;
    }
    if(kind==='upgrade'){
        const body=modal(root,'装备强化','',cb,true);
        renderStrengthening(body,model,cb,{el,button,art});
        return;
    }
    const titles={'learning-mode':['双语学习','遇见居民 · 开口交流'],'npc-services':['居民商店与课程',''],checkin:['米酒葫芦','在线相伴 · 每日好礼'],debug:['属性编辑器','调试工具 · 修改当前存档'],shop:['哈奇商城',''],equipment:['我的背包',''],quests:['冒险手记','全岛任务'],inventory:['我的背包',''],deck:['我的魔法卡包','准备你的魔法'],pet:['我的小伙伴','一路相伴的小伙伴'],settings:['旅途设置','你的冒险旅程'],map:['世界地图','魔法哈奇']};
    const body=modal(root,...titles[kind],cb,['deck','quests','inventory','equipment','pet','shop','map'].includes(kind)||kind==='debug');
    if(kind==='checkin'){
        body.closest('.modal').classList.add('checkin-modal');
        const grid=el('div','checkin-gourds');
        for(let index=0;index<5;index++)grid.append(el('article','gourd-reward',el('span','gourd-time'),gourdArt(),el('strong','gourd-coins'),el('small','gourd-items'),button('',()=>cb.action({type:'checkin',index}),'primary gourd-base'),button('',()=>model.membership?.isVip?cb.action({type:'checkin',index,bonus:true}):cb.panel('membership'),'secondary gourd-vip')));
        const bonusRows=model.assets.content.checkinConfig?.vipCoinsByLevel.slice(1).map((amount,index)=>{const row=el('span','');setText(row,'{level}级：{amount}仙豆',{level:index+1,amount});return row;})||[];
        const vipTable=el('details','checkin-vip-table',el('summary','','查看魔法星额外奖励'),el('div','',...bonusRows));
        body.append(el('p','checkin-intro','在小镇待得越久，酿造的米酒葫芦就越香醇。'),el('div','checkin-member-bar',el('p','checkin-member-summary'),button(model.membership?.isVip?'会员权益':'升级会员',()=>cb.panel('membership'),'secondary')),el('p','checkin-online'),grid,vipTable,el('p','checkin-rules muted','每天累计在线解锁，每个葫芦先领普通奖励，会员再领魔法星奖励。中途升级会员可补领当天已解锁的额外奖励；每天零点（北京时间）重置。'),el('p','checkin-rules muted','道具按原版兑换表发放。捕鱼网可在海上使用；中、大精力药剂可在渔场补充精力。小药剂、自动战斗药丸和抽奖道具的使用暂未开放，可保留在背包。原版幸运抽奖与日历签到暂未开放。'),el('p','checkin-balance muted'));

        updateCheckin(root,model);
    }

    if(kind==='npc-services')renderNpcServices(body,model,cb,{el,button,spellFace,art});
    if(kind==='shop')renderShop(body,model,cb,{el,button,art,tile,spellFace});
    if(kind==='pet'&&c.pets)renderPetCollection(body,model,cb,{el,button,spellFace,tile,icon,art});
    if(kind==='quests') {
        renderQuestJournal(body,model,cb,{el,button,objectiveLabel,spellFace});
    }
    if(kind==='inventory'||kind==='equipment') {
        const box=body.closest('.modal');box.classList.add('equipment-modal');
        renderEquipment(body,model,cb,{el,button,art,tile,spellFace});
        box.querySelector('.close-button').focus({preventScroll:true});
        box.addEventListener('keydown',event=>{
            if(event.key!=='Tab')return;
            const controls=[...box.querySelectorAll('button:not(:disabled),input:not(:disabled),summary')].filter(node=>node.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        });
    }
    if(kind==='deck') renderDeckEditor(body,model,cb,{el,button,spellFace});
    if(kind==='pet'&&!c.pets){
        body.append(el('h3','','初心之旅 · 咕噜噜教学'));
        body.append(el('div','pet-portrait',tile(assets,'creatures',save.pet?6:7,170,180)));
        if(save.pet)body.append(el('h3','center',save.pet.name),el('p','center muted',`等级 ${save.pet.level} · 经验 ${save.pet.xp} · 教学伙伴`),el('p','center','小小的咕噜噜，已经认定你是它最好的朋友。'),el('p','center muted',`战宠口粮 ${save.inventory[17172]||0} 包 · 每包增加 ${c.pet.foodXp} 经验`),button('喂养一包战宠口粮',()=>cb.action({type:'feed'}),'primary centered'));
        else body.append(el('h3','center','等待与你相遇'),el('p','center muted','完成青龙的强化指导，即可获得一枚出奇蛋。'),ownsEgg(save)?button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary centered'):el('p','center','继续你的冒险吧。'));
    }
    if(kind==='debug'){body.closest('.modal').classList.add('debug-modal');renderDebugEditor(body,model,cb,{el,button});}
    if(kind==='learning-mode')renderLearningMode(body,model,cb,{el,button});
    if(kind==='settings') {
        renderSettings(body,model,cb,{el,button});
    }
    if(kind==='map') {
        renderWorldMap(body,model,cb,{el,button});
    }
}
function ownsEgg(save){return (save.inventory[17307]||0)>0;}
export function renderDialogue(root,model,dialog,cb) {
    root.disposeDialogue?.();
    const {assets,save}=model,c=assets.content,npc=(dialog.lines?c.npcs[dialog.lines[dialog.index]?.npcId]:dialog.npc)||c.npcs[dialog.npcId];root.replaceChildren();root.className='overlay dialogue-layer rpg-dialogue-layer visible';
    const box=el('section','dialogue-box rpg-dialogue');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',fill('与{name}交谈',{name:npc.name}).text);
    box.classList.toggle('dialogue-sequence',!!dialog.lines);
    const portrait=art(assets,npc.portrait,150,190,'dialogue-portrait');
    const content=el('div','dialogue-content',el('p','eyebrow',islandName(npc.zone)),el('h2','',npc.name));
    const close=createCloseButton(cb.close);
    if(dialog.lines){
        const line=dialog.lines[dialog.index],last=dialog.index===dialog.lines.length-1;
        const replyLabel=entry=>entry.buttons?.[0]?.label&&!entry.buttons[0].label.includes('NEXT')?entry.buttons[0].label:'继续';
        const labels=dialog.lines.map((entry,index)=>index===dialog.lines.length-1?dialog.finishLabel:replyLabel(entry));
        // Reserve the same width for every step, including the longest reply.
        box.style.setProperty('--dialogue-action-width',`${Math.max(150,...labels.map(label=>Array.from(label||'继续').length*14+36))}px`);
        const next=button(last?dialog.finishLabel:replyLabel(line),cb.next,'primary');
        content.append(el('p','dialogue-text',line.text),el('div','dialogue-bottom',el('span','muted',`${dialog.index+1} / ${dialog.lines.length}`),next));
    }
    else {
        const q=currentQuest(save,c),state=q&&questState(save,q.id),ready=q&&questReady(save,q);
        const snap=catalogStatSnapshot(save,c),here=catalogQuestsForNpc(save,c,npc.id,snap);
        content.append(el('p','dialogue-text',npc.description||'欢迎来到这里，年轻的魔法师。愿你的旅程充满惊喜。'));
        const choices=el('div','dialogue-choices');
        if(q&&(q.startNpc===npc.id||q.endNpc===npc.id))content.append(el('div','dialogue-rewards',el('span','dialogue-reward-label','任务奖励'),...rewardsFor(save,c,q).map(r=>rewardChip(c,r,{el}))));
        if(q&&!state.accepted&&q.startNpc===npc.id){const accept=button('',()=>cb.startQuest(q),'primary');setText(accept,'接取任务 · {title}',{title:q.title});choices.append(accept);}
        if(q&&ready&&q.endNpc===npc.id){const claim=button('',()=>cb.finishQuest(q),'primary');setText(claim,'完成任务 · {title}',{title:q.title});choices.append(claim);}
        for(const quest of here.accept){const accept=button('',()=>cb.startCatalog(quest),'primary');setText(accept,'接取任务 · {title}',{title:quest.title});choices.append(accept);}
        for(const quest of here.claim){const claim=button('',()=>cb.finishCatalog(quest),'primary');setText(claim,'完成任务 · {title}',{title:quest.title});choices.append(claim);}
        const talk=pendingQuestTalk(save,q,npc.id);
        if(talk)choices.append(button(talk.label||'我想了解更多魔法',()=>cb.questTalk(q,talk),'primary'));
        if(q&&state.accepted&&!(ready&&q.endNpc===npc.id))choices.append(button(ready?'前往回报任务':'查看任务目标',()=>{cb.close();cb.track();},'secondary'));
        if(npcServices(c,npc).length)choices.append(button('查看商品与学习魔法',()=>cb.panel('npc-services',{npc}),'primary'));
        if(npc.id===36203)choices.append(button('查看装备与法杖',()=>cb.panel('inventory'),'secondary'));
        if(npc.id===36202)choices.append(button('看看我的宠物',()=>cb.panel('pet'),'secondary'));
        if(npc.id===36205)choices.append(button('打开世界地图',()=>cb.panel('worldmap'),'secondary'));
        if(model.save.languageLearning?.enabled&&model.save.zone==='camp')choices.append(button('和我聊聊',()=>cb.freeTalk(npc),'primary'));
        choices.append(button('下次再聊',cb.close,'text-button'));content.append(choices);
    }
    const hint=el('p','dialogue-hint');
    content.append(hint);
    box.append(portrait,content,close);root.append(box);
    const dialogueText=content.querySelector('.dialogue-text');
    bindDialogue(root,box,dialogueText,hint,content.querySelector('button.primary')||content.querySelector('button'),{
        lines:dialogueLearningLines(dialogueText.dataset.zh||dialogueText.textContent,save.languageLearning),readAloud:cb.readDialogue,mapWords:cb.mapDialogue,targetLocale:save.languageLearning.target,close:cb.close,
    });
}
// 战斗卡牌说明的展开偏好只存本机（localStorage），默认折叠。
const CARD_DETAIL_OPEN_KEY='haqi.battle.card-detail-open';
function isCardDetailOpen(){try{return localStorage.getItem(CARD_DETAIL_OPEN_KEY)==='open';}catch{return false;}}
function saveCardDetailOpen(open){try{localStorage.setItem(CARD_DETAIL_OPEN_KEY,open?'open':'closed');}catch{}}
export function renderBattle(root,model,cb) {
    try { renderBattleContent(root,model,cb); }
    catch(error) {
        console.error('战斗界面显示失败：',error);
        root.disposeHandGesture?.();root.disposeStatusTooltips?.();root.battleLayoutObserver?.disconnect();
        root.className='battle-layer visible';root.battleStatusEntries=[];
        root.replaceChildren(el('div','result-card',el('h2','','战斗界面暂时无法显示'),
            el('p','','进度已保留。可以重试显示，或撤退后重新挑战。'),
            button('重试显示',()=>renderBattle(root,model,cb),'primary'),
            button('撤退并保留进度',cb.retreat,'secondary')));
    }
}
function renderBattleContent(root,model,cb) {
    root.disposeStatusTooltips?.();
    root.disposeHandGesture?.();
    root.battleLayoutObserver?.disconnect();
    const oldSelected=root.querySelector('.hand-card.selected')?.dataset.seq;
    const switching=root.handBattle===model.battle&&!model.animating&&model.selected&&oldSelected!==String(model.selected.seq);
    // Capture the current visual positions, including any unfinished shuffle, before rebuilding.
    const oldHand=switching?new Map([...root.querySelectorAll('.hand-card')].map(node=>[node.dataset.seq,node.getBoundingClientRect()])):null;
    const previous=root.handBattle===model.battle?root.handSeqs||new Set():new Set();
    const {assets,save,battle,selected,discarded=[],animating}=model,hero=battle.sides.near[0];root.replaceChildren();root.className=`battle-layer visible${animating?' battle-playing':''}`;
    const soundIcon=icon('sound');
    // The storybook atlas has no sound frame; keep the small speaker SVG.
    delete soundIcon.dataset.uiIcon;
    const sound=button(soundIcon,cb.sound,'battle-sound');
    sound.title=model.soundEnabled?'关闭音效':'开启音效';
    sound.setAttribute('aria-label',sound.title);
    sound.setAttribute('aria-pressed',String(!!model.soundEnabled));
    const top=el('div','battle-heading',el('div','',el('p','eyebrow','魔法对决'),el('h2','',battle.monsterTemplates[0].name)),el('div','battle-heading-actions',sound,(()=>{const turn=el('span','badge');setText(turn,'第 {turn} 回合',{turn:battle.turn});return turn;})(),model.save.zone==='camp'&&model.save.languageLearning?.enabled?button('对话挑战',cb.battleTalk,'secondary small'):null,button('撤退',cb.retreat,'secondary small')));
    const canvas=el('canvas','battle-canvas');canvas.id='battle-canvas';canvas.setAttribute('aria-label','战斗法阵，点击敌人或自己选择目标');canvas.onclick=e=>{const point=Object.entries(canvas.battlePositions||{}).sort((a,b)=>Math.hypot(a[1].x-e.offsetX,a[1].y-e.offsetY)-Math.hypot(b[1].x-e.offsetX,b[1].y-e.offsetY))[0];if(point)cb.target(point[0]);};
    const blockedMessage=selected?castBlockedMessage(hero,battle.resolved.cards[selected.key],battle.resolved):'';
    const status=el('div','cast-announcement');status.id='cast-announcement';status.setAttribute('aria-live','polite');setText(status,battle.finished?'对决结束':animating?'魔法正在生效…':blockedMessage);
    status.classList.toggle('cast-blocked',!!blockedMessage&&!animating&&!battle.finished);
    const hand=el('div','battle-hand'),bottom=el('div','battle-controls');
    hand.classList.toggle('hand-focused',!!selected);
    hand.hidden=animating||battle.finished;
    const petHand=U.petCardsInHand(hero),petCardsOpen=!!model.petCardsOpen;
    const runeCardsOpen=!!model.runeCardsOpen;
    const runeHand=model.runeHand||[],runePageSize=matchMedia('(max-width:650px)').matches?4:8,runePages=Math.max(1,Math.ceil(runeHand.length/runePageSize));
    if(root.handBattle!==battle)root.runePage=0;
    root.runePage=Math.min(Math.max(0,root.runePage||0),runePages-1);
    const playerHand=(model.hand||U.cardsInHand(hero)).filter(h=>!discarded.includes(h.seq));
    const visibleHand=runeCardsOpen?runeHand.slice(root.runePage*runePageSize,root.runePage*runePageSize+runePageSize):petCardsOpen?petHand:playerHand;
    hand.setAttribute('aria-label',petCardsOpen?'宠物卡牌':'玩家手牌');
    const togglePets=button(petCardsOpen?`返回玩家卡（${playerHand.length}张）`:`使用宠物卡（${petHand.length}张）`,cb.togglePetCards,'secondary');
    togglePets.setAttribute('aria-pressed',String(petCardsOpen));
    togglePets.disabled=!petCardsOpen&&!petHand.length;
    togglePets.hidden=animating||battle.finished||!hero.petDeckSeq?.length;
    const toggleRunes=button(runeCardsOpen?'返回玩家卡':`符文卡（${(model.runeHand||[]).reduce((total,row)=>total+row.count,0)}）`,cb.toggleRunes,'secondary');
    toggleRunes.setAttribute('aria-pressed',String(runeCardsOpen));
    toggleRunes.hidden=animating||battle.finished;
    toggleRunes.disabled=!runeCardsOpen&&!model.runeHand?.length;
    const runePager=el('div','battle-hand-actions');
    runePager.hidden=!runeCardsOpen||runePages===1||animating||battle.finished;
    const changeRunePage=delta=>{root.runePage+=delta;cb.reselect();};
    const previousRunes=button('上一页',()=>changeRunePage(-1),'secondary small'),nextRunes=button('下一页',()=>changeRunePage(1),'secondary small');
    previousRunes.disabled=root.runePage===0;nextRunes.disabled=root.runePage===runePages-1;
    runePager.append(previousRunes,el('span','',`${root.runePage+1} / ${runePages}`),nextRunes);
    if(runeCardsOpen)hand.setAttribute('aria-label','符文卡牌');
    root.handBattle=battle;root.handSeqs=new Set(visibleHand.map(h=>h.seq));
    hand.style.gridTemplateColumns=visibleHand.map((h,i)=>h.seq===selected?.seq||i===visibleHand.length-1?'var(--hand-width)':'minmax(0,calc(var(--hand-width) + 12px))').join(' ');
    hand.style.justifyContent='center';
    if(runeCardsOpen)hand.style.gridTemplateColumns=visibleHand.map((row,index)=>index===visibleHand.length-1?'var(--hand-width)':'minmax(0,1fr)').join(' ');
    for(const h of hand.hidden?[]:visibleHand) {
        const card=battle.resolved.cards[h.key],artCard=assets.dataset.cards[h.key],available=U.isAlive(hero)&&U.canCast(hero,card,battle.resolved),isSelected=selected?.seq===h.seq;
        const node=el('div',`hand-card ${isSelected?'selected':''} ${available?'':'unavailable'}`);
        node.dataset.seq=h.seq;node.style.zIndex=isSelected?30:hand.children.length+1;
        node.hidden=!!selected&&!isSelected;
        if(!animating&&!previous.has(h.seq)){node.classList.add('card-arriving');node.style.setProperty('--deal-delay',`${hand.children.length*65}ms`);}
        const select=button(spellFace(assets,card,artCard),()=>cb.select(h),'card-select');
        select.disabled=animating||battle.finished;select.setAttribute('aria-label',fill(available?'选择{name}':'选择{name}（魔力不足或冷却中）',{name:artCard.name}).text);select.setAttribute('aria-pressed',String(isSelected));
        const drop=button('弃牌',()=>cb.discard(h.seq),'discard-button');drop.disabled=animating||battle.finished;
        const description=describeCard(card,{dataset:battle.resolved,translate:tr});
        node.title=fill('{name} · {target} · {description}',{name:artCard.name,target:description.target,description:description.summary}).text;
        node.title+=' · '+(runeCardsOpen?fill('符文剩余 {count}',{count:h.count}).text:tr(petCardsOpen?'宠物卡':'向下拖动或右键弃牌'));
        if(h.runeId)node.append(badge(`剩余 ${h.count}`));
        if(isSelected){
            // 上下结构：说明框折叠在卡面上方，点击"查看详情"展开，状态记在本地。
            const detailBody=el('div','battle-card-detail-body',el('h3','',artCard.name),el('p','card-detail-meta',description.meta),...description.lines.map(line=>el('p','',line)),el('small','',description.note));
            detailBody.id='selected-card-detail';detailBody.tabIndex=0;detailBody.setAttribute('aria-label',tr('卡牌效果说明'));detailBody.setAttribute('aria-live','polite');
            select.setAttribute('aria-describedby',detailBody.id);
            const toggleLabel=el('span','card-detail-toggle-label');
            const summary=el('summary','card-detail-toggle',toggleLabel);
            const detail=el('details','battle-card-detail',summary,detailBody);
            const syncToggle=()=>{setText(toggleLabel,detail.open?'收起':'查看详情');summary.setAttribute('aria-expanded',String(detail.open));};
            detail.open=isCardDetailOpen();
            detail.addEventListener('toggle',()=>{saveCardDetailOpen(detail.open);syncToggle();});
            syncToggle();
            node.append(detail,select,el('div','hand-focus-actions',petCardsOpen||runeCardsOpen?null:drop,button('重新选择',cb.reselect,'secondary small')));
        }
        else node.append(select);
        hand.append(node);
    }
    const pass=button('跳过本回合',cb.pass,'secondary');pass.disabled=animating||battle.finished;
    const legalTargets=selected?validTargets(battle,hero,battle.resolved.cards[selected.key]):[];
    const targetEnemy=button('对敌方施法',()=>cb.target(legalTargets[0]?.id),'primary'),targetSelf=button(legalTargets[0]?.id===hero.id?'对自己施法':'对友方施法',()=>cb.target(legalTargets[0]?.id),'primary');
    const kind=selected&&cardTargetKind(battle.resolved.cards[selected.key]),canPlay=selected&&!discarded.includes(selected.seq)&&U.isAlive(hero);targetEnemy.hidden=legalTargets.length!==1||kind==='friendly'||kind==='self';targetSelf.hidden=legalTargets.length!==1||kind==='hostile'||kind==='all';targetEnemy.disabled=targetSelf.disabled=animating||battle.finished||!canPlay;
    const deckLeft=el('small','');
    setText(deckLeft,'卡包剩余 {count} 张',{count:U.deckRemaining(hero)-discarded.length});
    bottom.append(el('div','pip-legend',deckLeft),el('div','battle-actions',targetEnemy,targetSelf,el('div','battle-hand-actions',togglePets,toggleRunes,pass)));
    const rosterOptions={heroId:hero.id,canTarget:unit=>!animating&&!battle.finished&&canPlay&&legalTargets.includes(unit),target:cb.target,el,button,schoolNames:SCHOOL_NAMES,colors:COLORS};
    const foes=createBattleRoster(battle,'far',rosterOptions),allies=createBattleRoster(battle,'near',rosterOptions);
    root.battleStatusEntries=[...foes.entries,...allies.entries];updateBattleRoster(root.battleStatusEntries,model.presentation);
    top.firstChild.replaceChildren(foes.roster);
    top.classList.add('battle-roster-heading');bottom.classList.add('battle-roster-controls');
    const targets=el('div','battle-party-controls',allies.roster);
    if(battle.monsterTemplates.some(row=>row.speciesId)){
        const catchStock=(model.runeHand||[]).filter(row=>battle.resolved.cards[row.key]?.type==='CatchPet').reduce((sum,row)=>sum+row.count,0);
        const capture=button(catchStock?`抓宠符文（${catchStock}）`:'没有抓宠符文',()=>cb.openRunes?.(),'secondary');
        capture.disabled=animating||battle.finished||hero.hp<=0||!catchStock;
        if(!catchStock)capture.title='向哈奇岛的安卓婆婆购买普通或高级抓宠符文';
        targets.append(capture);
    }
    bottom.append(targets,runePager);
    const challenge=null;
    root.append(top,canvas,status,challenge,hand,bottom);
    attachStatusTooltips(root,canvas);
    // The centred face passes left clicks to the arena; resolve its right click by bounds.
    root.oncontextmenu=e=>{
        if(petCardsOpen||runeCardsOpen||animating||battle.finished||e.pointerType==='touch'||!matchMedia('(pointer:fine)').matches)return;
        const node=e.target.closest('.hand-card')||(selected?hand.querySelector('.hand-card.selected'):null);
        const face=node?.querySelector('.card-select');if(!face||node.hidden)return;
        const rect=face.getBoundingClientRect();
        if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
        e.preventDefault();e.stopPropagation();cb.discard(Number(node.dataset.seq));
    };
    root.disposeHandGesture=selected?null:bindHandGesture(hand,{
        select:seq=>cb.select(visibleHand.find(h=>h.seq===seq)),
        play:seq=>cb.swipePlay(visibleHand.find(h=>h.seq===seq)),
        discard:petCardsOpen||runeCardsOpen||animating||battle.finished?null:cb.discard,
    });
    // Measure wrapped controls, including party targets, instead of assuming a fixed footer height.
    const layout=()=>{
        const footer=bottom.offsetHeight+(parseFloat(getComputedStyle(bottom).bottom)||0)+12;
        if(!selected)hand.style.bottom=`${footer}px`;
        status.style.top=`${top.offsetTop+top.offsetHeight+8}px`;
        // The arena fills the viewport. Cards and HUD float above it without resizing it.
    };
    root.battleLayoutObserver=new ResizeObserver(layout);
    for(const node of [root,top,hand,bottom,status])root.battleLayoutObserver.observe(node);
    layout();
    if(oldHand)animateHandSelection(hand,oldHand,oldSelected,String(selected.seq));
    const log=el('details','battle-log',el('summary','','战斗记录'),el('div','',...battle.events.filter(e=>['cast','damage','heal','dot','hot','speak','fizzle','capture'].includes(e.type)).slice(-24).map(e=>el('p','',eventLabel(e,battle,assets)))));root.append(log);
    if(battle.finished&&!animating){
        const won=battle.winner==='near';
        const rewardLine=el('p','');
        if(won){
            const xp=battle.monsterTemplates.reduce((sum,m)=>sum+Math.ceil(m.xp*(save.pendingEncounter?.magicStarExperiencePercent??100)/100),0);
            const coins=battle.monsterTemplates.reduce((sum,m)=>sum+m.coins,0);
            setText(rewardLine,'获得 {xp} 经验 · {coins} 奇豆',{xp,coins});
        }else setText(rewardLine,'已保留你的物品与任务进度。调整卡包，再来试试吧。');
        const result=el('div','result-card',el('p','eyebrow',won?'对决胜利':'继续加油'),el('h2','',won?'魔法的力量，属于你！':'休息一下，再来挑战'),rewardLine,button(won?'收下奖励，继续冒险':'回到安全地点',cb.finish,'primary'));root.append(result);
        if(battle.captured?.length)result.insertBefore(el('p','',`捕获伙伴：${battle.captured.map(id=>assets.content.pets[id]?.name||id).join('、')}（已拥有的伙伴转为经验）`),result.lastChild);
    }
}
function animateHandSelection(hand,previous,oldSelected,selected) {
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    for(const node of hand.children) {
        if(node.hidden)continue;
        const before=previous.get(node.dataset.seq);if(!before)continue;
        const after=node.getBoundingClientRect(),dx=before.left-after.left,dy=before.top-after.top;
        const entering=node.dataset.seq===selected,returning=node.dataset.seq===oldSelected;
        if(!dx&&!dy&&!entering&&!returning)continue;
        const restingZ=node.style.zIndex;
        if(returning)node.style.zIndex='30';
        if(entering)node.style.zIndex='31';
        // FLIP keeps every card continuous: the old card settles, the new one lifts out,
        // and neighbours slide into their new spacing without replaying the deal animation.
        const motion=node.animate([
            {translate:`${dx}px ${dy}px`},
            {translate:`${dx*.45}px ${dy*.45+(entering?-22:returning?8:0)}px`,offset:.5},
            {translate:'0px 0px'},
        ],{duration:entering||returning?340:300,easing:'cubic-bezier(.22,.7,.25,1)'});
        motion.finished.then(()=>{node.style.zIndex=restingZ;},()=>{});
    }
}
// Copy the painted face before a round redraw removes the old hand.
export function capturePlayedCard(root,seq) {
    const source=root.querySelector(`.hand-card[data-seq="${seq}"] .card-select`);
    if(!source)return null;
    const node=source.cloneNode(true),rect=source.getBoundingClientRect(),base=root.getBoundingClientRect();
    const originals=source.querySelectorAll('canvas');
    node.querySelectorAll('canvas').forEach((canvas,i)=>canvas.getContext('2d').drawImage(originals[i],0,0));
    return {node,seq,x:rect.left-base.left,y:rect.top-base.top,width:rect.width,height:rect.height};
}
export function animatePlayedCard(root,card,duration) {
    if(!duration)return;
    const {node,x,y,width,height}=card;
    node.classList.add('played-card');node.disabled=true;node.setAttribute('aria-hidden','true');
    Object.assign(node.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`});root.append(node);
    const arena=root.querySelector('.battle-canvas').getBoundingClientRect(),base=root.getBoundingClientRect();
    const dx=arena.left-base.left+arena.width/2-x-width/2,dy=arena.top-base.top+arena.height*.53-y-height/2;
    node.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.85)`,opacity:1,offset:.72},{transform:`translate(${dx}px,${dy-20}px) scale(.45)`,opacity:0}],{duration,easing:'ease-in-out',fill:'forwards'}).finished.then(()=>node.remove(),()=>node.remove());
}
export function eventLabel(e,battle,assets) {
    const caster=battle.unitsById[e.caster]?.name||'',target=battle.unitsById[e.target]?.name||'',card=assets.dataset.cards[e.card]?.name||'';
    if(e.label==='reflection'&&['cast','damage'].includes(e.type))return fill(e.type==='cast'?'{caster} 的魔镜反弹 {card} → {target}':'{target} 受到魔镜反弹的 {amount} 点伤害',{caster,target,card,amount:e.amount}).text;
    if(e.type==='cast')return fill('{caster} → {target} · {card}',{caster,target,card}).text;
    if(e.type==='damage'||e.type==='dot')return fill('{target} 受到 {amount} 点伤害',{target,amount:e.amount}).text;
    if(e.type==='heal'||e.type==='hot')return fill('{target} 恢复 {amount} 点生命',{target,amount:e.amount}).text;
    if(e.type==='speak')return fill('{caster}：{text}',{caster,text:e.text}).text;
    if(e.type==='capture')return fill(e.success?'{target}捕获成功！':e.runeId?'{target}挣脱了抓宠符文':'{target}挣脱了晶球',{target}).text;
    if(e.type==='pass')return fill('{caster} 跳过本回合',{caster}).text;
    if(e.type==='fizzle')return fill('{caster} 的魔法失误了',{caster}).text;
    return '';
}
