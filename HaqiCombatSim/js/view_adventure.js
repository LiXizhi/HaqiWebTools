// DOM rendering and input bindings. Actions go to the adventure_app controller.
import { currentQuest,questState,questReady,questProgress,SCHOOL_NAMES,rewardsFor,deckLimits,canEquip,recommendedDeck } from './adventure_core.js';
import * as U from './combat_unit_core.js';
import { expectedBaseDamage,expectedBaseHeal,cardTargetKind } from './combat_cards_core.js';
import { COLORS } from './adventure_renderer.js';
export function el(tag,cls,...children) {
    const n=document.createElement(tag);if(cls)n.className=cls;
    for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)n.append(child instanceof Node?child:document.createTextNode(String(child)));
    return n;
}
export function button(label,fn,cls='') {const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;}
const paths={book:'M4 4h6q2 0 2 2q0-2 2-2h6v15h-6q-2 0-2 2q0-2-2-2H4z M12 6v15',cards:'M5 5h12v15H5z M8 2h12v15',bag:'M5 8h14v12H5z M8 8V5a4 4 0 0 1 8 0v3',pet:'M8 13q4-5 8 0q6 7-4 6q-10 1-4-6 M5 6v3 M10 3v4 M15 3v4 M20 6v3',settings:'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2 M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0',map:'M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z M9 3v16 M15 5v16',sound:'M4 10h4l5-5v14l-5-5H4z M17 8q5 4 0 8',arrow:'M5 12h14 M13 6l6 6-6 6'};
function icon(kind) {const span=el('span','icon');span.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]||paths.book}"/></svg>`;return span;}
function art(assets,ref,w=76,h=90,cls='') {const c=el('canvas',`art ${cls}`);c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.draw(c.getContext('2d'),ref,0,0,c.width,c.height);return c;}
function tile(assets,sheet,index,w=90,h=95) {const c=el('canvas','art');c.width=w*2;c.height=h*2;c.style.width=`${w}px`;c.style.height=`${h}px`;assets.tile(c.getContext('2d'),sheet,index,0,0,c.width,c.height);return c;}
function badge(text,cls=''){return el('span',`badge ${cls}`,text);}
const schoolDescription={fire:'火焰与持续伤害，点燃你的热情。',ice:'坚固的护盾与寒冰魔法，稳步迎战。',storm:'强力的单体攻击，让雷霆为你而鸣。',life:'治疗与自然的力量，守护生命。',death:'吸取生命、布下陷阱，掌握幽暗魔法。'};
export function renderEntry(root,assets,hasSave,cb,error='') {
    root.replaceChildren();root.className='entry-screen';
    let school='fire',appearance='boy';
    const form=el('form','character-form');
    const eyebrow=el('p','eyebrow','魔法哈奇 · 第一章');
    const intro=el('div','entry-intro',eyebrow,el('h1','game-title','魔法哈奇'),el('div','title-rule'),el('h2','chapter-title','初心之旅'),el('p','entry-description','穿过晨光中的魔法营地，遇见熟悉的伙伴。\n选一门魔法，翻开属于你的第一张卡牌。'));
    intro.append(el('div','entry-tags',badge('原版任务与角色'),badge('五系卡牌战斗'),badge('本地自动存档')));
    if(hasSave)intro.append(button('继续我的冒险',cb.continue,'primary continue-button'));
    intro.append(button('云端旅途',cb.cloud,'secondary cloud-entry-button'));
    intro.append(el('p','entry-note','键盘 / 鼠标 / 触摸均可游玩'),el('a','sim-link','战斗模拟器'));
    intro.querySelector('a').href='HaqiCombatSim.html';
    const name=el('input','name-input');name.id='hero-name';name.name='name';name.value='小哈奇';name.maxLength=16;name.autocomplete='off';name.required=true;
    const nameLabel=el('label','field-label','你的名字');nameLabel.htmlFor='hero-name';
    const preview=el('div','avatar-choice');
    const boys=button([tile(assets,'sprites',8),el('span','','魔法少年')],()=>chooseAppearance('boy'),'avatar-option selected');
    const girls=button([tile(assets,'sprites',12),el('span','','魔法少女')],()=>chooseAppearance('girl'),'avatar-option');
    boys.setAttribute('aria-pressed','true');girls.setAttribute('aria-pressed','false');
    function chooseAppearance(value){appearance=value;boys.classList.toggle('selected',value==='boy');girls.classList.toggle('selected',value==='girl');boys.setAttribute('aria-pressed',String(value==='boy'));girls.setAttribute('aria-pressed',String(value==='girl'));}
    preview.append(boys,girls);
    const schoolRow=el('div','school-choices'),desc=el('p','school-description',schoolDescription.fire);
    for(const [key,label]of Object.entries(SCHOOL_NAMES)){
        const b=button([el('i','school-gem'),el('span','',label)],()=>{school=key;for(const btn of schoolRow.children){const selected=btn.dataset.school===key;btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',String(selected));}desc.textContent=schoolDescription[key];},`school-choice ${key==='fire'?'selected':''}`);
        b.dataset.school=key;b.style.setProperty('--school',COLORS[key]);b.setAttribute('aria-pressed',String(key==='fire'));schoolRow.append(b);
    }
    const submit=el('button','primary begin-button',hasSave?'开始一段新旅程':'启程，前往魔法营地');submit.type='submit';
    form.append(el('p','eyebrow','开启你的魔法旅程'),el('h2','','成为魔法学徒'),preview,nameLabel,name,el('p','field-label','选择你的魔法学系'),schoolRow,desc,submit);
    if(hasSave)form.append(el('small','muted','开启新旅程会替换本地存档，可先在设置中导出。'));
    if(error)form.append(el('p','error-text',error));
    form.onsubmit=e=>{e.preventDefault();cb.create({name:name.value,school,appearance});};
    root.append(intro,form,el('div','entry-footer','魔法营地 → 最后的考核 → 哈奇小镇'));
}
export function objectiveLabel(g,c) {
    if(g.kind==='talk')return `与${c.npcs[g.id]?.name||g.id}交谈`;
    if(g.kind==='defeat')return `击败${Object.values(c.monsters).find(m=>m.goalId===g.id)?.name||'训练敌人'}`;
    return ({79016:'强化一次晶石法杖',79019:'喂养你的宠物',79037:'装备翡翠口袋并保存配卡','hatch-pet':'打开出奇蛋，获得宠物','equip-staff':'装备晶石法杖'})[g.id]||'完成导师的指导';
}
export function renderHud(root,model,cb) {
    const {assets,save}=model,c=assets.content,q=currentQuest(save,c);root.replaceChildren();
    const portrait=tile(assets,'sprites',save.appearance==='girl'?12:8,60,65),next=c.progression.xpThresholds[save.level]||save.xp,previous=c.progression.xpThresholds[save.level-1];
    const xp=el('div','xp-bar',el('i'));xp.firstChild.style.width=`${save.level===10?100:Math.max(0,(save.xp-previous)/(next-previous)*100)}%`;
    const status=button([portrait,el('div','hero-text',el('strong','',save.name),el('span','',`${SCHOOL_NAMES[save.school]}学徒 · 等级 ${save.level}`),xp)],()=>cb.panel('inventory'),'hero-status');
    root.append(status,el('div','location-label',el('span','',save.zone==='camp'?'魔 法 营 地':'哈 奇 小 镇'),el('small','',save.zone==='camp'?'在晨光中，发现魔法':'新的故事，在这里继续')));
    const map=el('canvas');map.id='minimap';map.width=240;map.height=170;
    const mapBox=el('div','minimap-box',el('div','minimap-head',el('span','',save.zone==='camp'?'魔法营地':'哈奇小镇'),button([icon('map'),el('span','sr-only','打开地图')],()=>cb.panel('map'),'icon-button')),map,el('div','minimap-foot',badge(`仙豆 ${save.inventory[17213]||0}`),el('span','save-indicator','已存档')));
    root.append(mapBox);
    const tracker=el('section','quest-tracker',el('div','tracker-top',el('span','eyebrow','冒险手记'),el('span','chapter-count',`${Object.values(save.quests).filter(x=>x.claimed).length} / 14`)));
    if(q){
        const state=questState(save,q.id),ready=questReady(save,q);
        tracker.append(el('h3','',q.title));
        if(!state.accepted)tracker.append(el('p','',`去找${c.npcs[q.startNpc].name}，接取新的任务。`));
        else if(ready)tracker.append(el('p','',`任务已完成，向${c.npcs[q.endNpc].name}回报。`));
        else for(const g of questProgress(save,q))tracker.append(el('div',`tracker-goal ${g.value>=g.count?'complete':''}`,el('span','',g.value>=g.count?'✓':'◇'),el('span','',objectiveLabel(g,c))));
        tracker.append(button([ready?'回报任务':'追踪目标',icon('arrow')],cb.track,'track-button'));
    }else tracker.append(el('h3','','新的魔法旅程'),el('p','',save.visitedTown?'你已完成第一章。和镇上的居民聊聊，或到郊外练习魔法吧。':'你通过了毕业考核！前往营地南边的传送阵，探索哈奇小镇。'),button('前往传送阵',cb.track,'track-button'));
    root.append(tracker);
    const nav=el('nav','game-nav');nav.setAttribute('aria-label','游戏菜单');
    for(const [id,label,key]of [['quests','任务','book'],['deck','卡包','cards'],['inventory','背包','bag'],['pet','宠物','pet'],['settings','设置','settings']])nav.append(button([icon(key),el('span','',label)],()=>cb.panel(id),'nav-button'));
    root.append(nav,el('div','movement-hint','WASD / 方向键移动 · 点击寻路 / 按住跟随 · E 交谈'));
    const interaction=button('交谈',cb.interact,'interact-button');interaction.id='interact';interaction.hidden=true;root.append(interaction);
    const pad=el('div','touch-joystick'),stick=el('span','joystick-stick');
    pad.setAttribute('role','group');pad.setAttribute('aria-label','移动摇杆，拖动控制方向，松开停止');
    pad.append(stick);let pointer=null;
    pad.resetInput=()=>{const id=pointer;pointer=null;stick.style.transform='translate(-50%,-50%)';pad.classList.remove('active');cb.steer(0,0);if(id!==null&&pad.hasPointerCapture(id))pad.releasePointerCapture(id);};
    const steer=e=>{
        const r=pad.getBoundingClientRect(),radius=r.width*.3;
        let x=(e.clientX-r.left-r.width/2)/radius,y=(e.clientY-r.top-r.height/2)/radius;
        const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
        stick.style.transform=`translate(-50%,-50%) translate(${x*radius}px,${y*radius}px)`;
        const speed=Math.max(0,(Math.min(1,length)-.15)/.85);
        cb.steer(length?x/Math.hypot(x,y)*speed:0,length?y/Math.hypot(x,y)*speed:0);
    };
    pad.onpointerdown=e=>{if(pointer!==null||e.button!==0)return;e.preventDefault();pointer=e.pointerId;pad.setPointerCapture(pointer);pad.classList.add('active');steer(e);};
    pad.onpointermove=e=>{if(e.pointerId===pointer){e.preventDefault();steer(e);}};
    pad.onpointerup=pad.onpointercancel=pad.onlostpointercapture=e=>{if(e.pointerId===pointer)pad.resetInput();};
    root.append(pad);
}
function modal(root,title,subtitle,cb,wide=false) {
    root.replaceChildren();root.className='overlay visible';
    const box=el('section',`modal ${wide?'wide':''}`);box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    const close=button('×',cb.close,'close-button');close.setAttribute('aria-label','关闭');
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
    // The original title is already printed in the artwork; retain its accessible name.
    const canvas=el('canvas','spell-art');canvas.width=302;canvas.height=460;
    assets.draw(canvas.getContext('2d'),artCard.art,0,0,302,460,false);
    const cost=card.pipcost===114||card.pipcost==='X'?'X':String(card.pipcost);
    const pip=el('span','spell-cost',cost);pip.setAttribute('aria-label',`消耗 ${cost} 点魔力`);
    pip.title=`消耗 ${cost} 点魔力。本系法术：1个超级魔力抵2点；其他系抵1点。`;
    const rounds=assets.content.items[artCard.itemId]?.stats?.[186]??0;
    const cooldown=el('span','spell-cooldown',rounds);cooldown.setAttribute('aria-label',`冷却 ${rounds} 回合`);cooldown.title=`冷却 ${rounds} 回合（左中数字）`;
    return el('span','spell-face',canvas,el('span','sr-only',artCard.name),pip,cooldown,el('span','spell-description',spellHint(card,assets.dataset)));
}
function itemStats(item) {
    const names={101:'生命',102:'超级魔力率',111:'全系攻击',112:'烈火攻击',113:'寒冰攻击',114:'风暴攻击',116:'生命攻击',117:'死亡攻击',119:'全系防御',167:'卡包容量',170:'单卡上限',184:'起始普通魔力',185:'起始超级魔力'};
    return Object.entries(item.stats||{}).filter(([id])=>names[id]).map(([id,n])=>`${names[id]} +${n}${Number(id)>=102&&Number(id)<=126?'%':''}`).join(' · ');
}
function itemCard(assets,item,count,actions=[]) {
    return el('div','inventory-item',item.art?art(assets,item.art,56,56):el('span','item-placeholder','◆'),el('div','item-info',el('strong','',item.name),el('small','muted',`拥有 ${count} 件`),el('p','',String(itemStats(item)||item.description||'').split('|').join(' · ').split('#').join(' ').slice(0,130))),el('div','item-actions',actions));
}
export function renderPanel(root,kind,model,cb) {
    const {assets,save}=model,c=assets.content,d=assets.dataset;
    const titles={quests:['冒险手记','第一章 · 初心之旅'],inventory:['我的背包','装备与旅途收藏'],deck:['我的魔法卡包','准备你的魔法'],pet:['我的小伙伴','一路相伴的小伙伴'],settings:['旅途设置','你的冒险旅程'],map:['世界地图','魔法哈奇']};
    const body=modal(root,...titles[kind],cb,kind==='deck'||kind==='quests');
    if(kind==='quests') {
        const current=currentQuest(save,c);
        for(const q of c.quests){const state=questState(save,q.id);const block=el('article',`journal-quest ${state.claimed?'done':''} ${current?.id===q.id?'current':''}`,el('div','journal-title',el('span','quest-number',String(q.id-62999).padStart(2,'0')),el('h3','',q.title),badge(state.claimed?'已完成':state.accepted?'进行中':current?.id===q.id?'可接取':'未开启')));
            if(current?.id===q.id||state.accepted){block.append(el('p','',q.description));for(const g of questProgress(save,q))block.append(el('p','goal-line',`${g.value>=g.count?'✓':'◇'} ${objectiveLabel(g,c)}　${g.value}/${g.count}`));if(!state.claimed)block.append(button('追踪这个任务',()=>{cb.close();cb.track();},'secondary'));}
            body.append(block);
        }
    }
    if(kind==='inventory') {
        body.append(el('div','wallet',badge(`仙豆 ${save.inventory[17213]||0}`),badge(`奇豆 ${save.inventory[100]||0}`),badge(`等级 ${save.level}`)));
        const items=Object.entries(save.inventory).filter(([id,n])=>n>0&&!['100','113','17213'].includes(id));
        if(!items.length)body.append(el('div','empty-state','背包里还空空的。去找青龙导师，领取你的第一个任务吧。'));
        for(const [id,n]of items){const item=c.items[id];if(!item)continue;const actions=[];
            if(item.kind===1||item.slot===24){const equipped=Number(save.equipment[item.slot])===Number(id);const b=button(equipped?'已装备':'装备',()=>cb.action({type:'equip',itemId:id}),'secondary small');b.disabled=equipped||!canEquip(save,item,c);actions.push(b);}
            if(Number(id)===1912){const lv=save.upgrades[id]||0;actions.push(el('small','muted',`强化 +${lv}`));if(lv<c.upgrade.length)actions.push(button(`强化 · ${c.upgrade.find(u=>u.level===lv+1)?.cost[1]}仙豆`,()=>cb.action({type:'upgrade',itemId:id}),'secondary small'));}
            if(Number(id)===17307&&!save.pet)actions.push(button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary small'));
            if(Number(id)===17172)actions.push(button('喂养宠物',()=>cb.action({type:'feed'}),'secondary small'));
            if(!actions.length)actions.push(el('small','muted','旅途收藏'));
            body.append(itemCard(assets,item,n,actions));
        }
    }
    if(kind==='deck') {
        let draft=save.deck.map(x=>({...x}));const limits=deckLimits(save,c);
        const counter=el('span','deck-counter'),grid=el('div','deck-grid');
        const update=()=>{counter.textContent=`${draft.reduce((n,x)=>n+x.count,0)} / ${limits.capacity} 张 · 同一张最多 ${limits.eachCapacity} 份`;};
        const paint=()=>{grid.replaceChildren();for(const lesson of c.learn[save.school]){
            const card=d.cards[lesson.key],owned=save.cards[lesson.key]||0,n=draft.find(x=>x.key===lesson.key)?.count||0;
            const count=el('strong','',String(n));const change=delta=>{const value=n+delta;if(value<0||value>Math.min(owned,limits.eachCapacity))return;if(delta>0&&draft.reduce((a,x)=>a+x.count,0)>=limits.capacity)return;draft=draft.filter(x=>x.key!==lesson.key);if(value)draft.push({key:lesson.key,count:value});paint();update();};
            const cardNode=el('div',`deck-card ${owned?'':'locked'}`,spellFace(assets,card),el('small','muted',owned?`拥有 ${owned} 张`:`等级 ${lesson.level} 解锁`),el('div','stepper',button('−',()=>change(-1)),count,button('+',()=>change(1))));
            grid.append(cardNode);
        }};
        body.append(el('div','deck-toolbar',counter,button('推荐配卡',()=>{draft=recommendedDeck(save,c);paint();update();},'secondary')),el('p','muted','右上：魔力消耗；左中：冷却回合。本系法术的1个超级魔力抵2点，其他系抵1点。装备提供的法术会额外加入战斗。'),grid,button('保存卡包',()=>cb.action({type:'deck',deck:draft}),'primary save-deck'));paint();update();
    }
    if(kind==='pet'){
        body.append(el('div','pet-portrait',tile(assets,'creatures',save.pet?6:7,170,180)));
        if(save.pet)body.append(el('h3','center',save.pet.name),el('p','center muted',`等级 ${save.pet.level} · 经验 ${save.pet.xp} · 跟随中`),el('p','center','小小的咕噜噜，已经认定你是它最好的朋友。'),el('p','center muted',`战宠口粮 ${save.inventory[17172]||0} 包 · 每包增加 ${c.pet.foodXp} 经验`),button('喂养一包战宠口粮',()=>cb.action({type:'feed'}),'primary centered'));
        else body.append(el('h3','center','等待与你相遇'),el('p','center muted','完成青龙的强化指导，即可获得一枚出奇蛋。'),ownsEgg(save)?button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary centered'):el('p','center','继续你的冒险吧。'));
    }
    if(kind==='settings') {
        body.append(button('云端旅途 · 跨设备继续冒险',cb.cloud,'primary settings-button'));
        body.append(el('p','','进度自动保存在当前浏览器。你可以导出存档，在其他设备继续这段旅程。'),button(save.music?'背景音乐：开启':'背景音乐：关闭',cb.music,'secondary settings-button'),button('导出我的存档',cb.export,'secondary settings-button'));
        const input=el('input');input.type='file';input.accept='.json,application/json';input.id='import-save';input.onchange=()=>{if(input.files[0])cb.import(input.files[0]);};body.append(el('label','file-label','导入存档',input));
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
    const {assets,save}=model,c=assets.content,npc=c.npcs[dialog.npcId];root.replaceChildren();root.className='overlay dialogue-layer visible';
    const box=el('section','dialogue-box');box.setAttribute('role','dialog');box.setAttribute('aria-label',`与${npc.name}交谈`);
    const portrait=art(assets,npc.portrait,150,190,'dialogue-portrait');
    const content=el('div','dialogue-content',el('p','eyebrow',npc.zone==='camp'?'魔法营地':'哈奇小镇'),el('h2','',npc.name));
    const close=button('×',cb.close,'close-button');close.setAttribute('aria-label','关闭');
    if(dialog.lines){const line=dialog.lines[dialog.index];content.append(el('p','dialogue-text',line.text),el('div','dialogue-bottom',el('span','muted',`${dialog.index+1} / ${dialog.lines.length}`),button(dialog.index===dialog.lines.length-1?dialog.finishLabel:(line.buttons?.[0]?.label?.includes('NEXT')?'继续':line.buttons?.[0]?.label||'继续'),cb.next,'primary')));}
    else {
        const q=currentQuest(save,c),state=q&&questState(save,q.id),ready=q&&questReady(save,q);
        content.append(el('p','dialogue-text',npc.description||'欢迎来到这里，年轻的魔法师。愿你的旅程充满惊喜。'));
        const choices=el('div','dialogue-choices');
        if(q&&!state.accepted&&q.startNpc===npc.id)choices.append(button(`接取任务 · ${q.title}`,()=>cb.startQuest(q),'primary'));
        if(q&&ready&&q.endNpc===npc.id)choices.append(button(`完成任务 · ${q.title}`,()=>cb.finishQuest(q),'primary'));
        const talk=q&&state.accepted&&q.talks.find(t=>t.npcId===npc.id);
        if(talk)choices.append(button(talk.label||'我想了解更多魔法',()=>cb.questTalk(q,talk),'primary'));
        if(q&&state.accepted&&!ready&&q.startNpc===npc.id)choices.append(button('查看任务目标',()=>{cb.close();cb.track();},'secondary'));
        if(npc.id===36203)choices.append(button('查看装备与法杖',()=>cb.panel('inventory'),'secondary'));
        if(npc.id===36202)choices.append(button('看看我的宠物',()=>cb.panel('pet'),'secondary'));
        if(npc.id===36205)choices.append(button('去哈奇小镇',()=>cb.travel('town'),'secondary'));
        choices.append(button('下次再聊',cb.close,'text-button'));content.append(choices);
    }
    box.append(portrait,content,close);root.append(box);
}
export function renderBattle(root,model,cb) {
    const {assets,save,battle,selected,discarded=[],animating}=model,hero=battle.sides.near[0];root.replaceChildren();root.className='battle-layer visible';
    const top=el('div','battle-heading',el('div','',el('p','eyebrow','魔法对决'),el('h2','',battle.monsterTemplates[0].name)),el('div','',badge(`第 ${battle.turn} 回合`),button('云端存档',cb.cloud,'secondary small'),button('导出存档',cb.export,'secondary small'),button('撤退',cb.retreat,'secondary small')));
    const canvas=el('canvas','battle-canvas');canvas.id='battle-canvas';canvas.setAttribute('aria-label','战斗法阵，点击敌人或自己选择目标');canvas.onclick=e=>cb.target(e.offsetX<canvas.clientWidth/2?'hero':'mob0');
    const status=el('div','cast-announcement');status.id='cast-announcement';status.setAttribute('aria-live','polite');status.textContent=battle.finished?'对决结束':animating?'魔法正在生效…':selected?'点击法阵中的目标施法':'选择一张卡牌，再点击目标';
    const hand=el('div','battle-hand'),bottom=el('div','battle-controls');
    for(const h of U.cardsInHand(hero)) {
        const card=battle.resolved.cards[h.key],artCard=assets.dataset.cards[h.key],available=U.canCast(hero,card,battle.resolved),isSelected=selected?.seq===h.seq,isDiscard=discarded.includes(h.seq);
        const node=el('div',`hand-card ${isSelected?'selected':''} ${isDiscard?'discarded':''} ${available?'':'unavailable'}`);
        const select=button(spellFace(assets,card,artCard),()=>cb.select(h),'card-select');
        select.disabled=animating||battle.finished||!available||isDiscard;select.setAttribute('aria-label',`选择${artCard.name}`);
        const drop=button(isDiscard?'撤销弃牌':'弃牌',()=>cb.discard(h.seq),'discard-button');drop.disabled=animating||battle.finished;
        node.title=`${artCard.name} · ${cardTargetKind(card)==='hostile'?'对敌人':'对友方'} · ${expectedBaseDamage(card)?'基础伤害 '+expectedBaseDamage(card):expectedBaseHeal(card)?'基础治疗 '+expectedBaseHeal(card):'增益 / 减益魔法'}`;
        node.append(select,drop);hand.append(node);
    }
    const pass=button('跳过本回合',cb.pass,'secondary');pass.disabled=animating||battle.finished;
    const targetEnemy=button('对敌方施法',()=>cb.target('mob0'),'primary'),targetSelf=button('对自己施法',()=>cb.target('hero'),'primary');
    const kind=selected&&cardTargetKind(battle.resolved.cards[selected.key]);targetEnemy.hidden=!selected||kind==='friendly'||kind==='self';targetSelf.hidden=!selected||kind==='hostile';targetEnemy.disabled=targetSelf.disabled=animating;
    bottom.append(el('div','pip-legend',el('span','','蓝色：普通魔力'),el('span','','金色：超级魔力'),el('small','',`卡包剩余 ${U.deckRemaining(hero)} 张`)),el('div','battle-actions',targetEnemy,targetSelf,pass));
    root.append(top,canvas,status,hand,bottom);
    const log=el('details','battle-log',el('summary','','战斗记录'),el('div','',...battle.events.filter(e=>['cast','damage','heal','dot','hot','speak','fizzle'].includes(e.type)).slice(-24).map(e=>el('p','',eventLabel(e,battle,assets)))));root.append(log);
    if(battle.finished&&!animating){
        const won=battle.winner==='near';const result=el('div','result-card',el('p','eyebrow',won?'对决胜利':'继续加油'),el('h2','',won?'魔法的力量，属于你！':'休息一下，再来挑战'),el('p','',won?`获得 ${battle.monsterTemplates[0].xp} 经验 · ${battle.monsterTemplates[0].coins} 奇豆`:'已保留你的物品与任务进度。调整卡包，再来试试吧。'),button(won?'收下奖励，继续冒险':'回到安全地点',cb.finish,'primary'));root.append(result);
    }
}
export function eventLabel(e,battle,assets) {
    const caster=battle.unitsById[e.caster]?.name||'',target=battle.unitsById[e.target]?.name||'',card=assets.dataset.cards[e.card]?.name||'';
    if(e.type==='cast')return `${caster} → ${target} · ${card}`;
    if(e.type==='damage'||e.type==='dot')return `${target} 受到 ${e.amount} 点伤害`;
    if(e.type==='heal'||e.type==='hot')return `${target} 恢复 ${e.amount} 点生命`;
    if(e.type==='speak')return `${caster}：${e.text}`;
    if(e.type==='pass')return `${caster} 跳过本回合`;
    if(e.type==='fizzle')return `${caster} 的魔法失误了`;
    return '';
}
