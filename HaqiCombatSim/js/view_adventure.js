import { castBlockedMessage } from './adventure_cast_feedback_core.js';
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
import { renderPetCollection,renderShop,starterPicker,petPortrait } from './view_adventure_pets.js';
// DOM rendering and input bindings. Actions go to the adventure_app controller.
import { currentQuest,questState,questReady,questProgress,pendingQuestTalk,SCHOOL_NAMES,rewardsFor,deckLimits,recommendedDeck } from './adventure_core.js';
import { rewardLabel } from './adventure_rewards_core.js';
import * as U from './combat_unit_core.js';
import { expectedBaseDamage,expectedBaseHeal,cardTargetKind } from './combat_cards_core.js';
import { renderEquipment } from './view_adventure_equipment.js';
import { COLORS } from './adventure_renderer.js';
export function el(tag,cls,...children) {
    const n=document.createElement(tag);if(cls)n.className=cls;
    for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)n.append(child instanceof Node?child:document.createTextNode(String(child)));
    return n;
}
export function button(label,fn,cls='') {const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;}
const paths={book:'M4 4h6q2 0 2 2q0-2 2-2h6v15h-6q-2 0-2 2q0-2-2-2H4z M12 6v15',cards:'M5 5h12v15H5z M8 2h12v15',bag:'M5 8h14v12H5z M8 8V5a4 4 0 0 1 8 0v3',pet:'M8 13q4-5 8 0q6 7-4 6q-10 1-4-6 M5 6v3 M10 3v4 M15 3v4 M20 6v3',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',sound:'M4 10h4l5-5v14l-5-5H4z M17 8q5 4 0 8',arrow:'M5 12h14 M13 6l6 6-6 6'};
paths.gourd='M10 2h4v3c4 1 4 6 1 8 7 3 6 9-3 9S2 16 9 13C6 11 6 6 10 5z M8 13h8 M14 12l5 4';
paths.cloud='M6 18a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 0 10 M12 20V10 M8 14l4-4 4 4';
paths.close='M6 6l12 12 M18 6L6 18';
paths.shop='M3 9l2-6h14l2 6 M3 9v3h18V9 M5 12v9h14v-9 M9 21v-6h6v6';
function icon(kind) {const span=el('span','icon');span.dataset.uiIcon=kind;span.setAttribute('aria-hidden','true');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]||paths.book}"/></svg>`;return span;}
function art(assets,ref,w=76,h=90,cls='') {const c=el('canvas',`art ${cls}`);c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.draw(c.getContext('2d'),ref,0,0,c.width,c.height);return c;}
function tile(assets,sheet,index,w=90,h=95) {const c=el('canvas','art');c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.tile(c.getContext('2d'),sheet,index,0,0,c.width,c.height);return c;}
function badge(text,cls=''){return el('span',`badge ${cls}`,text);}
const schoolDescription={fire:'火焰与持续伤害，点燃你的热情。',ice:'坚固的护盾与寒冰魔法，稳步迎战。',storm:'强力的单体攻击，让雷霆为你而鸣。',life:'治疗与自然的力量，守护生命。',death:'吸取生命、布下陷阱，掌握幽暗魔法。'};
export function renderEntry(root,assets,stored,cb,error='') {
    const draft=cb.draft||{name:'小哈奇',school:'fire',appearance:'boy',starter:'dragon_green',step:1};
    root.replaceChildren();root.className='entry-screen entry-wizard';
    const intro=el('div','entry-intro',el('p','eyebrow','魔法哈奇 · 第一章'),el('h1','game-title','魔法哈奇'),el('div','title-rule'),el('h2','chapter-title','初心之旅'),el('p','entry-description','选一门魔法，遇见你的伙伴。\n从这里，开始一段新的旅程。'));
    intro.append(button(cb.owner?'我的云端旅途':'登录 Keepwork',cb.login||cb.cloud,'secondary cloud-entry-button'));
    const form=el('form','character-form creation-form');
    root.append(el('div','entry-layout',intro,form));
    function paint() {
        cb.stopPreview?.();form.replaceChildren();root.classList.toggle('school-step',draft.step===3);root.classList.toggle('companion-step',draft.step===2);
        const steps=el('div','creation-steps');
        for(const [index,label]of ['起名字','选择抱抱龙','选择系别'].entries()){
            if(index)steps.append(el('i',''));
            const item=el('span',draft.step===index+1?'current':draft.step>index+1?'done':'',`0${index+1} ${label}`);
            if(draft.step===index+1)item.setAttribute('aria-current','step');steps.append(item);
        }
        const titles=['你的冒险，从名字开始','选择你的抱抱龙','找到属于你的魔法'];
        const captions=['先选一个模样，再告诉我们你的名字。','选一位伙伴，陪你踏上魔法旅程。','点击系别，看看它的代表技能。喜欢的话，就选它吧。'];
        form.append(steps,el('h2','',titles[draft.step-1]),el('p','creation-caption',captions[draft.step-1]));
        if(draft.step===1) {
            const preview=el('div','avatar-choice');
            for(const [value,label,index]of [['boy','魔法少年',8],['girl','魔法少女',12]]){
                const b=button([tile(assets,'sprites',index),el('span','',label)],()=>{draft.appearance=value;for(const n of preview.children){const on=n.dataset.appearance===value;n.classList.toggle('selected',on);n.setAttribute('aria-pressed',String(on));}},`avatar-option ${draft.appearance===value?'selected':''}`);
                b.dataset.appearance=value;b.setAttribute('aria-pressed',String(draft.appearance===value));preview.append(b);
            }
            const name=el('input','name-input');name.id='hero-name';name.name='name';name.value=draft.name;name.maxLength=16;name.autocomplete='off';name.required=true;name.oninput=()=>{draft.name=name.value;};
            const label=el('label','field-label','你的名字');label.htmlFor=name.id;
            form.append(preview,label,name);
        } else if(draft.step===2) {
            const scene=el('div','companion-scene');
            const hero=el('div','companion-hero',tile(assets,'sprites',draft.appearance==='girl'?12:8,100,120),el('span','companion-name',draft.name));
            const companion=el('div','companion-position');
            const greeting=el('p','companion-greeting');greeting.setAttribute('role','status');
            scene.append(el('span','companion-scene-label','魔法营地 · 初次相遇'),el('div','companion-clearing'),hero,companion);
            const meet=(id,animate)=>{
                const pet=petPortrait(assets,id,0,82),runner=el('div',`companion-runner${animate?' arriving':''}`,pet);
                companion.replaceChildren(runner);
                greeting.textContent=`${assets.content.pets[id].name}，以后就一起冒险吧。`;
                scene.setAttribute('aria-label',`${draft.name}和${assets.content.pets[id].name}站在一起`);
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
            const canvas=el('canvas','creation-preview');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${SCHOOL_NAMES[draft.school]}系技能动画预览`);
            const status=el('p','preview-status','正在准备技能演出…');status.setAttribute('role','status');
            const choices=cb.previewChoices(draft.school),cards=el('div','creation-skill-choices');
            if(!choices.some(c=>c.key===draft.previewKey))draft.previewKey=choices[0]?.key;
            let pause;
            const play=(key,automatic=false)=>{draft.previewKey=key;for(const b of cards.children){const on=b.dataset.key===key;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}pause.textContent='暂停';if(!cb.busy)cb.preview(canvas,key,draft.appearance,text=>{status.textContent=text;},automatic?()=>{const index=choices.findIndex(c=>c.key===key);play(choices[(index+1)%choices.length].key,true);}:undefined);};
            for(const choice of choices){
                const face=el('canvas','creation-skill-card');face.width=112;face.height=112;face.setAttribute('aria-hidden','true');
                const base=assets.effects.cards[choice.key]?.base;
                if(base)assets.skillArt.ensure(base).then(()=>{if(face.isConnected)assets.skillArt.drawSubject(face.getContext('2d'),base,0,0,112,112);}).catch(()=>{});
                const b=button([face,el('span','',choice.name)],()=>play(choice.key),'creation-skill-option');b.dataset.key=choice.key;cards.append(b);
            }
            pause=button('暂停',()=>{pause.textContent=cb.pausePreview()?'继续播放':'暂停';},'text-button');
            form.append(schools,el('p','school-description',schoolDescription[draft.school]),canvas,
                el('div','preview-controls',status,button('重播',()=>play(draft.previewKey),'text-button'),pause),cards,
                el('p','creation-preview-note','代表技能演示，需在冒险中逐步学习。'));
            if(draft.previewKey)play(draft.previewKey,true);
        }
        const submit=el('button','primary begin-button',cb.busy|| (draft.step===1?'下一步 · 选择抱抱龙':draft.step===2?'下一步 · 选择系别':`确认选择${SCHOOL_NAMES[draft.school]} · 开始冒险`));submit.type='submit';form.append(submit);
        if(draft.step===2)form.append(button('导入魔法哈奇角色',cb.importOriginal,'text-button creation-import'));
        if(draft.step>1)form.append(button('上一步',()=>{draft.step--;paint();root.scrollTop=0;},'text-button creation-back'));
        if(cb.roles)form.append(button('返回我的角色',cb.roles,'text-button creation-back'));
        if(error){const status=el('p','error-text',error);status.setAttribute('role','alert');form.append(status);}
        if(cb.busy)for(const node of root.querySelectorAll('button,input'))node.disabled=true;
    }
    form.onsubmit=e=>{e.preventDefault();if(cb.busy)return;if(draft.step<3){draft.name=draft.name.trim()||'小哈奇';draft.step++;paint();root.scrollTop=0;}else cb.create({name:draft.name,school:draft.school,appearance:draft.appearance,starter:draft.starter});};
    paint();
}
export function objectiveLabel(g,c) {
    if(g.kind==='talk')return `与${c.npcs[g.id]?.name||g.id}交谈`;
    if(g.kind==='defeat')return `击败${Object.values(c.monsters).find(m=>m.goalId===g.id)?.name||'训练敌人'}`;
    return ({79016:'强化一次晶石法杖',79019:'喂养你的宠物',79037:'装备翡翠口袋并保存配卡','hatch-pet':'打开出奇蛋，获得宠物','equip-staff':'装备晶石法杖'})[g.id]||'完成导师的指导';
}
export function updateHeroHealth(root,save,content) {
    const bar=root.querySelector('.hero-health');if(!bar)return;
    const maxHp=specMaxHp(playerSpec(save,content)),hp=Math.max(0,Math.min(maxHp,Math.floor(save.heroHp??maxHp)));
    bar.style.setProperty('--health',`${maxHp>0?hp/maxHp*100:0}%`);
    bar.querySelector('.hero-health-label').textContent=`${hp} / ${maxHp}`;
    bar.setAttribute('aria-label',`生命 ${hp} / ${maxHp}`);
}
function checkinTime(ms){return `${Math.ceil(ms/60000)} 分钟`;}
function gourdArt(){
    const art=el('span','gourd-art');
    art.innerHTML='<svg viewBox="0 0 80 112" aria-hidden="true"><ellipse cx="40" cy="104" rx="25" ry="5" fill="#685225" opacity=".15"/><path d="M35 8h10l-2 12c17 4 21 23 9 34 26 13 23 47-12 47S2 67 28 54C16 43 20 24 37 20z" fill="currentColor" stroke="#8f621f" stroke-width="2.5"/><path d="M29 33c-6 8-3 14 0 17M23 71c-6 11-1 19 5 22" fill="none" stroke="#fff4b6" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M27 54q13 6 26 0l-1 7q-12 5-24 0z" fill="#af4e32"/><path d="m46 60 12 19-9-3-3 8-7-23" fill="#af4e32"/><path d="M33 8h14v7H33z" fill="#826035"/><circle cx="38" cy="79" r="10" fill="#fff0b5" opacity=".85"/><text x="38" y="83" text-anchor="middle" font-size="12" fill="#8f621f">福</text></svg>';
    return art;
}
export function updateCheckin(root,model) {
    const status=checkinStatus(model.save,model.assets.content,model.now??Date.now());
    const nav=root.querySelector('.checkin-button');
    if(nav){nav.querySelector('small').textContent=status.ready?'可领取':status.finished?'已领完':checkinTime(status.remainingMs);nav.classList.toggle('reward-ready',status.ready);}
    const grid=root.querySelector('.checkin-gourds');if(!grid)return;
    for(const g of status.gourds){
        const b=grid.children[g.index],label=g.claimed?'已领取':g.ready?'点击领取':`还需 ${checkinTime(g.remainingMs)}`;
        b.disabled=!g.ready;b.classList.toggle('ready',g.ready);b.classList.toggle('claimed',g.claimed);
        b.querySelector('.gourd-time').textContent=`${g.minute} 分钟`;
        b.querySelector('.gourd-coins').textContent=`${g.coins} 奇豆`;
        b.querySelector('.gourd-state').textContent=label;
        b.setAttribute('aria-label',`${g.minute}分钟葫芦，${g.coins}奇豆，${label}`);b.title=label;
    }
    root.querySelector('.checkin-online').textContent=`今日累计在线 ${Math.floor(status.onlineMs/60000)} 分钟`;
    root.querySelector('.checkin-balance').textContent=`当前拥有 ${model.save.inventory[100]||0} 奇豆`;
}
export function renderHud(root,model,cb) {
    const {assets,save}=model,c=assets.content,q=currentQuest(save,c);root.replaceChildren();
    const next=c.progression.xpThresholds[save.level]||save.xp,previous=c.progression.xpThresholds[save.level-1];
    const xp=el('div','xp-bar',el('i'));xp.firstChild.style.width=`${save.level>=c.progression.levelCap?100:Math.max(0,(save.xp-previous)/(next-previous)*100)}%`;
    const name=button(el('strong','',save.name),()=>cb.panel('equipment'),'hero-name');name.title='角色与装备（R）';
    const membership=button('升级会员',cb.membership,'hero-membership');
    const status=el('section','hero-status',el('div','hero-text',el('div','hero-heading',name,membership),el('span','',`${SCHOOL_NAMES[save.school]}学徒 · 等级 ${save.level}`),xp));
    const warning=el('span','save-indicator',model.storageWarning?'存档未保存':'');warning.hidden=!model.storageWarning;
    status.querySelector('.hero-text').append(el('div','hero-health',el('i'),el('span','hero-health-label')),warning);
    updateHeroHealth(status,save,c);
    root.append(status,el('div','location-label',el('span','',save.zone==='camp'?'魔 法 营 地':'哈 奇 小 镇'),el('small','',save.zone==='camp'?'在晨光中，发现魔法':'新的故事，在这里继续')));
    const utilities=el('nav','utility-nav');utilities.setAttribute('aria-label','其他功能');
    const checkin=button([icon('gourd'),el('span','','签到'),el('small','','')],()=>cb.panel('checkin'),'utility-button checkin-button');
    checkin.title='定时领取奇豆';
    utilities.append(checkin);
    for(const [label,key,action]of [['地图','map',()=>cb.panel('map')],['云存档','cloud',cb.cloud],['设置','settings',()=>cb.panel('settings')]])utilities.append(button([icon(key),el('span','',label)],action,'utility-button'));
    root.append(utilities);
    updateCheckin(root,model);
    const tracker=el('section','quest-tracker',el('div','tracker-top',el('span','eyebrow','冒险手记'),el('span','chapter-count',`${Object.values(save.quests).filter(x=>x.claimed).length} / 14`)));
    if(q){
        const state=questState(save,q.id),ready=questReady(save,q);
        const statusLabel=ready?'可以交付':state.accepted?'进行中':'可接取';
        const marker=el('span',`quest-state ${ready?'ready':state.accepted?'active':'available'}`,ready?'?':'!');marker.setAttribute('aria-hidden','true');
        const questLink=button([marker,el('span','quest-title',q.title)],cb.track,'quest-track-title');questLink.title=`${statusLabel}，点击自动追踪`;questLink.setAttribute('aria-label',`${q.title}，${statusLabel}，自动追踪`);
        tracker.append(el('h3','',questLink));
        if(!state.accepted)tracker.append(el('p','',`去找${c.npcs[q.startNpc].name}，接取新的任务。`));
        else if(ready)tracker.append(el('p','',`任务已完成，向${c.npcs[q.endNpc].name}回报。`));
        else for(const g of questProgress(save,q))tracker.append(el('div',`tracker-goal ${g.value>=g.count?'complete':''}`,el('span','',g.value>=g.count?'✓':'◇'),el('span','',objectiveLabel(g,c))));
        tracker.append(button('追踪',cb.track,'track-button'));
    }else tracker.append(el('h3','','新的魔法旅程'),el('p','',save.visitedTown?'你已完成第一章。和镇上的居民聊聊，或到郊外练习魔法吧。':'你通过了毕业考核！前往营地南边的传送阵，探索哈奇小镇。'),button('前往传送阵',cb.track,'track-button'));
    root.append(tracker);
    const nav=el('nav','game-nav');nav.setAttribute('aria-label','游戏菜单');
    for(const [id,label,key]of [['quests','任务','book'],['deck','卡包','cards'],['inventory','背包','bag'],['pet','宠物','pet'],['shop','商店','shop']])nav.append(button([icon(key),el('span','',label)],()=>cb.panel(id),'nav-button'));
    root.append(nav,el('div','movement-hint','WASD / 方向键移动 · 点击寻路 / 按住跟随 · 滚轮缩放 · E 交谈'));
    const interaction=button('交谈',cb.interact,'interact-button');interaction.id='interact';interaction.hidden=true;root.append(interaction);
    root.append(el('div','touch-movement-hint','单指拖动移动 · 双指缩放 · 靠近后交谈或挑战'));
}
function modal(root,title,subtitle,cb,wide=false) {
    root.replaceChildren();root.className='overlay visible';
    const box=el('section',`modal ${wide?'wide':''}`);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    const close=button(icon('close'),cb.close,'close-button');close.setAttribute('aria-label','关闭');
    box.append(el('header','modal-header',el('div','',el('p','eyebrow',subtitle),el('h2','',title)),close));const body=el('div','modal-body');box.append(body);root.append(box);
    return body;
}
function spellHint(card,d) {
    if(expectedBaseDamage(card))return `伤害 ${expectedBaseDamage(card)}`;
    if(expectedBaseHeal(card))return `治疗 ${expectedBaseHeal(card)}`;
    if(card.params.charms)return d.charms.charm[card.params.charms]?.desc||'增益魔法';
    if(card.params.wards)return d.charms.ward[card.params.wards]?.desc||'护盾 / 陷阱';
    return '辅助魔法';
}
function spellFace(assets,card,artCard=card) {
    // kids pe_item.DrawCardMask: 151×230, pips (120,5), cooldown (7,115), description (18,142).
    // Shared background + generated subject; title/numbers/description stay dynamic.
    const canvas=el('canvas','spell-art');canvas.width=302;canvas.height=460;
    const cost=card.pipcost===114||card.pipcost==='X'||Number(card.pipcost)<0?'X':String(card.pipcost);
    const rounds=assets.content.items[artCard.itemId]?.stats?.[186]??0;
    const description=spellHint(card,assets.dataset);
    assets.skillArt.drawCard(canvas.getContext('2d'),card,{name:artCard.name,cooldown:rounds,description});
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${artCard.name}，消耗 ${cost} 点魔力，冷却 ${rounds} 回合。${description}`);
    canvas.title=`${description}。本系法术：1个超级魔力抵2点；其他系抵1点。`;
    return el('span','spell-face',canvas);
}
export function renderPanel(root,kind,model,cb) {
    const {assets,save}=model,c=assets.content,d=assets.dataset;
    const titles={checkin:['米酒葫芦','在线相伴 · 每日好礼'],debug:['属性编辑器','调试工具 · 修改当前存档'],shop:['全局商店','等级科技树 · 装备、伙伴与补给'],equipment:['角色与装备','魔法学徒 · 旅途行装'],quests:['冒险手记','第一章 · 初心之旅'],inventory:['我的背包','装备与旅途收藏'],deck:['我的魔法卡包','准备你的魔法'],pet:['我的小伙伴','一路相伴的小伙伴'],settings:['旅途设置','你的冒险旅程'],map:['世界地图','魔法哈奇']};
    const body=modal(root,...titles[kind],cb,['deck','quests','inventory','equipment','pet','shop'].includes(kind)||kind==='debug');
    if(kind==='checkin'){
        body.closest('.modal').classList.add('checkin-modal');
        const grid=el('div','checkin-gourds');
        for(let index=0;index<5;index++)grid.append(button([el('span','gourd-time'),gourdArt(),el('strong','gourd-coins'),el('span','gourd-state')],()=>cb.action({type:'checkin',index}),'gourd-reward'));
        body.append(el('p','checkin-online'),grid,el('p','checkin-rules muted','亮起的葫芦可以直接领取。每天累计在线解锁，每个葫芦限领一次；每日零点（北京时间）重置。'),el('p','checkin-balance muted'));
        updateCheckin(root,model);
    }
    if(kind==='shop')renderShop(body,model,cb,{el,button,art});
    if(kind==='pet'&&c.pets)renderPetCollection(body,model,cb,{el,button});
    if(kind==='quests') {
        const current=currentQuest(save,c);
        for(const q of c.quests){const state=questState(save,q.id);const block=el('article',`journal-quest ${state.claimed?'done':''} ${current?.id===q.id?'current':''}`,el('div','journal-title',el('span','quest-number',String(q.id-62999).padStart(2,'0')),el('h3','',q.title),badge(state.claimed?'已完成':state.accepted?'进行中':current?.id===q.id?'可接取':'未开启')));
            if(current?.id===q.id||state.accepted){block.append(el('p','',q.description));for(const g of questProgress(save,q))block.append(el('p','goal-line',`${g.value>=g.count?'✓':'◇'} ${objectiveLabel(g,c)}　${g.value}/${g.count}`));if(!state.claimed)block.append(button('追踪这个任务',()=>{cb.close();cb.track();},'secondary'));}
            body.append(block);
        }
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
    if(kind==='pet'){
        body.append(el('h3','','初心之旅 · 咕噜噜教学'));
        body.append(el('div','pet-portrait',tile(assets,'creatures',save.pet?6:7,170,180)));
        if(save.pet)body.append(el('h3','center',save.pet.name),el('p','center muted',`等级 ${save.pet.level} · 经验 ${save.pet.xp} · 教学伙伴`),el('p','center','小小的咕噜噜，已经认定你是它最好的朋友。'),el('p','center muted',`战宠口粮 ${save.inventory[17172]||0} 包 · 每包增加 ${c.pet.foodXp} 经验`),button('喂养一包战宠口粮',()=>cb.action({type:'feed'}),'primary centered'));
        else body.append(el('h3','center','等待与你相遇'),el('p','center muted','完成青龙的强化指导，即可获得一枚出奇蛋。'),ownsEgg(save)?button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary centered'):el('p','center','继续你的冒险吧。'));
    }
    if(kind==='debug'){body.closest('.modal').classList.add('debug-modal');renderDebugEditor(body,model,cb,{el,button});}
    if(kind==='settings') {
        body.append(button('切换 / 新建角色',cb.roles,'primary settings-button'));
        body.append(button('属性编辑器 · 调试',()=>cb.panel('debug'),'secondary settings-button'));
        body.append(button(model.soundEnabled?'技能音效：开启':'技能音效：关闭',cb.sound,'secondary settings-button'));
        body.append(button('云端旅途 · 跨设备继续冒险',cb.cloud,'primary settings-button'));
        body.append(el('p','','进度自动保存在当前浏览器。登录 Keepwork 后可同步角色，在其他设备继续旅程。'),button(save.music?'背景音乐：开启':'背景音乐：关闭',cb.music,'secondary settings-button'));
        body.append(button('回到开始画面',cb.title,'secondary settings-button'),el('hr'),el('h3','','关于这段旅程'),el('p','muted','本章保留魔法哈奇 kids 原版角色、任务对白和卡牌数据。地图、升级节奏和毕业后的镇区是适合单人游玩的二维改编。'),el('details','source-details',el('summary','','查看改编说明'),...c.adaptations.map(t=>el('p','muted',t))),el('a','sim-link','打开战斗模拟器'));
        body.querySelector('a').href='HaqiCombatSim.html';
        const effectsLink=el('a','sim-link','技能特效工坊');effectsLink.href='HaqiEffects.html';effectsLink.target='_blank';effectsLink.rel='noopener';body.append(effectsLink);
    }
    if(kind==='map') {
        body.append(art(assets,save.zone==='camp'?c.extras.campMap:c.extras.townMap,Math.min(520,window.innerWidth-80),300),el('p','muted','原版地图参考 · 当前二维地图压缩了步行距离'),button('追踪当前任务',()=>{cb.close();cb.track();},'primary'));
    }
}
function ownsEgg(save){return (save.inventory[17307]||0)>0;}
export function renderDialogue(root,model,dialog,cb) {
    root.disposeDialogue?.();
    const {assets,save}=model,c=assets.content,npc=c.npcs[dialog.lines?.[dialog.index]?.npcId]||c.npcs[dialog.npcId];root.replaceChildren();root.className='overlay dialogue-layer rpg-dialogue-layer visible';
    const box=el('section','dialogue-box rpg-dialogue');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',`与${npc.name}交谈`);
    box.classList.toggle('dialogue-sequence',!!dialog.lines);
    const portrait=art(assets,npc.portrait,150,190,'dialogue-portrait');
    const content=el('div','dialogue-content',el('p','eyebrow',npc.zone==='camp'?'魔法营地':'哈奇小镇'),el('h2','',npc.name));
    const close=button(icon('close'),cb.close,'close-button');close.setAttribute('aria-label','关闭');
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
        content.append(el('p','dialogue-text',npc.description||'欢迎来到这里，年轻的魔法师。愿你的旅程充满惊喜。'));
        const choices=el('div','dialogue-choices');
        if(q&&(q.startNpc===npc.id||q.endNpc===npc.id))content.append(el('div','dialogue-rewards',el('span','dialogue-reward-label','任务奖励'),...rewardsFor(save,c,q).map(r=>el('span','dialogue-reward',rewardLabel(c,r)))));
        if(q&&!state.accepted&&q.startNpc===npc.id)choices.append(button(`接取任务 · ${q.title}`,()=>cb.startQuest(q),'primary'));
        if(q&&ready&&q.endNpc===npc.id)choices.append(button(`完成任务 · ${q.title}`,()=>cb.finishQuest(q),'primary'));
        const talk=pendingQuestTalk(save,q,npc.id);
        if(talk)choices.append(button(talk.label||'我想了解更多魔法',()=>cb.questTalk(q,talk),'primary'));
        if(q&&state.accepted&&!(ready&&q.endNpc===npc.id))choices.append(button(ready?'前往回报任务':'查看任务目标',()=>{cb.close();cb.track();},'secondary'));
        if(npc.id===36203)choices.append(button('查看装备与法杖',()=>cb.panel('inventory'),'secondary'));
        if(npc.id===36202)choices.append(button('看看我的宠物',()=>cb.panel('pet'),'secondary'));
        if(npc.id===36205)choices.append(button('去哈奇小镇',()=>cb.travel('town'),'secondary'));
        choices.append(button('下次再聊',cb.close,'text-button'));content.append(choices);
    }
    const hint=el('p','dialogue-hint');
    content.append(hint);
    box.append(portrait,content,close);root.append(box);
    bindDialogue(root,box,content.querySelector('.dialogue-text'),hint,content.querySelector('button.primary')||content.querySelector('button'));
}
export function renderBattle(root,model,cb) {
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
    const top=el('div','battle-heading',el('div','',el('p','eyebrow','魔法对决'),el('h2','',battle.monsterTemplates[0].name)),el('div','battle-heading-actions',sound,badge(`第 ${battle.turn} 回合`),button('撤退',cb.retreat,'secondary small')));
    const canvas=el('canvas','battle-canvas');canvas.id='battle-canvas';canvas.setAttribute('aria-label','战斗法阵，点击敌人或自己选择目标');canvas.onclick=e=>{const point=Object.entries(canvas.battlePositions||{}).sort((a,b)=>Math.hypot(a[1].x-e.offsetX,a[1].y-e.offsetY)-Math.hypot(b[1].x-e.offsetX,b[1].y-e.offsetY))[0];if(point)cb.target(point[0]);};
    const blockedMessage=selected?castBlockedMessage(hero,battle.resolved.cards[selected.key],battle.resolved):'';
    const status=el('div','cast-announcement');status.id='cast-announcement';status.setAttribute('aria-live','polite');status.textContent=battle.finished?'对决结束':animating?'魔法正在生效…':selected?(blockedMessage||'点击法阵中的目标施法'):'选择一张卡牌，再点击目标';
    status.classList.toggle('cast-blocked',!!blockedMessage&&!animating&&!battle.finished);
    const hand=el('div','battle-hand'),bottom=el('div','battle-controls');
    hand.classList.toggle('hand-focused',!!selected);
    hand.hidden=animating||battle.finished;
    const visibleHand=model.hand||U.cardsInHand(hero);
    root.handBattle=battle;root.handSeqs=new Set(visibleHand.map(h=>h.seq));
    hand.style.gridTemplateColumns=visibleHand.map((h,i)=>h.seq===selected?.seq||i===visibleHand.length-1?'var(--hand-width)':'minmax(0,1fr)').join(' ');
    for(const h of hand.hidden?[]:visibleHand) {
        const card=battle.resolved.cards[h.key],artCard=assets.dataset.cards[h.key],available=U.isAlive(hero)&&U.canCast(hero,card,battle.resolved),isSelected=selected?.seq===h.seq,isDiscard=discarded.includes(h.seq);
        const node=el('div',`hand-card ${isSelected?'selected':''} ${isDiscard?'discarded':''} ${available?'':'unavailable'}`);
        node.dataset.seq=h.seq;node.style.zIndex=isSelected?30:hand.children.length+1;
        node.hidden=!!selected&&!isSelected;
        if(!animating&&!previous.has(h.seq)){node.classList.add('card-arriving');node.style.setProperty('--deal-delay',`${hand.children.length*65}ms`);}
        const select=button(spellFace(assets,card,artCard),()=>cb.select(h),'card-select');
        select.disabled=animating||battle.finished;select.setAttribute('aria-label',`选择${artCard.name}${available?'':'（魔力不足或冷却中）'}`);select.setAttribute('aria-pressed',String(isSelected));
        const drop=button(isDiscard?'撤销弃牌':'弃牌',()=>cb.discard(h.seq),'discard-button');drop.disabled=animating||battle.finished;
        node.title=`${artCard.name} · ${cardTargetKind(card)==='hostile'?'对敌人':'对友方'} · ${expectedBaseDamage(card)?'基础伤害 '+expectedBaseDamage(card):expectedBaseHeal(card)?'基础治疗 '+expectedBaseHeal(card):'增益 / 减益魔法'}`;
        node.title+=isDiscard?' · 右键撤销弃牌':' · 右键弃牌';
        if(isSelected)node.append(select,el('div','hand-focus-actions',drop,button('重新选择',cb.reselect,'secondary small')));
        else node.append(select,drop);
        hand.append(node);
    }
    const pass=button('跳过本回合',cb.pass,'secondary');pass.disabled=animating||battle.finished;
    const legalTargets=selected?validTargets(battle,hero,battle.resolved.cards[selected.key]):[];
    const targetEnemy=button('对敌方施法',()=>cb.target(legalTargets[0]?.id),'primary'),targetSelf=button(legalTargets[0]?.id===hero.id?'对自己施法':'对友方施法',()=>cb.target(legalTargets[0]?.id),'primary');
    const kind=selected&&cardTargetKind(battle.resolved.cards[selected.key]),canPlay=selected&&!discarded.includes(selected.seq)&&U.isAlive(hero);targetEnemy.hidden=legalTargets.length!==1||kind==='friendly'||kind==='self';targetSelf.hidden=legalTargets.length!==1||kind==='hostile'||kind==='all';targetEnemy.disabled=targetSelf.disabled=animating||battle.finished||!canPlay;
    bottom.append(el('div','pip-legend',el('span','','蓝色：普通魔力'),el('span','','金色：超级魔力'),el('small','',`卡包剩余 ${U.deckRemaining(hero)} 张`)),el('div','battle-actions',targetEnemy,targetSelf,pass));
    const rosterOptions={heroId:hero.id,canTarget:unit=>!animating&&!battle.finished&&canPlay&&legalTargets.includes(unit),target:cb.target,el,button,schoolNames:SCHOOL_NAMES,colors:COLORS};
    const foes=createBattleRoster(battle,'far',rosterOptions),allies=createBattleRoster(battle,'near',rosterOptions);
    root.battleStatusEntries=[...foes.entries,...allies.entries];updateBattleRoster(root.battleStatusEntries,model.presentation);
    top.firstChild.replaceChildren(foes.roster);
    top.classList.add('battle-roster-heading');bottom.classList.add('battle-roster-controls');
    const targets=el('div','battle-party-controls',allies.roster);
    if(battle.monsterTemplates[0].speciesId){const capture=button(`捕获（晶球 ${battle.captureStock-battle.captureUsed}）`,()=>cb.capture('mob0'),'secondary');capture.disabled=animating||battle.finished||hero.hp<=0||battle.captureStock<=battle.captureUsed;targets.append(capture);}
    bottom.append(targets);
    root.append(top,canvas,status,hand,bottom);
    // The centred face passes left clicks to the arena; resolve its right click by bounds.
    root.oncontextmenu=e=>{
        if(animating||battle.finished||e.pointerType==='touch'||!matchMedia('(pointer:fine)').matches)return;
        const node=e.target.closest('.hand-card')||(selected?hand.querySelector('.hand-card.selected'):null);
        const face=node?.querySelector('.card-select');if(!face||node.hidden)return;
        const rect=face.getBoundingClientRect();
        if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
        e.preventDefault();e.stopPropagation();cb.discard(Number(node.dataset.seq));
    };
    root.disposeHandGesture=selected?null:bindHandGesture(hand,{
        select:seq=>cb.select(visibleHand.find(h=>h.seq===seq)),
        play:seq=>cb.swipePlay(visibleHand.find(h=>h.seq===seq)),
        hint:status,
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
        const won=battle.winner==='near';const result=el('div','result-card',el('p','eyebrow',won?'对决胜利':'继续加油'),el('h2','',won?'魔法的力量，属于你！':'休息一下，再来挑战'),el('p','',won?`获得 ${battle.monsterTemplates[0].xp} 经验 · ${battle.monsterTemplates[0].coins} 奇豆`:'已保留你的物品与任务进度。调整卡包，再来试试吧。'),button(won?'收下奖励，继续冒险':'回到安全地点',cb.finish,'primary'));root.append(result);
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
    if(e.type==='cast')return `${caster} → ${target} · ${card}`;
    if(e.type==='damage'||e.type==='dot')return `${target} 受到 ${e.amount} 点伤害`;
    if(e.type==='heal'||e.type==='hot')return `${target} 恢复 ${e.amount} 点生命`;
    if(e.type==='speak')return `${caster}：${e.text}`;
    if(e.type==='capture')return e.success?`${target}捕获成功！`:`${target}挣脱了晶球`;
    if(e.type==='pass')return `${caster} 跳过本回合`;
    if(e.type==='fizzle')return `${caster} 的魔法失误了`;
    return '';
}
