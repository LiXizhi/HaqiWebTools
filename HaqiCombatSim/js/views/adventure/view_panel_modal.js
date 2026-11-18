import {setText,fill} from '../../locale_runtime.js';
import {monsterArtBinding} from '../../adventure_monster_art_core.js';
import {heroPortrait} from '../../hero_renderer.js';
import {mentorPracticeCue,mentorPracticeName} from '../../mentor_practice_core.js';
import {OPENING_PET} from '../../opening_journey_core.js';
import {renderDebugEditor} from './view_adventure_debug.js';
import {renderDeckEditor} from './view_adventure_deck.js';
import {renderEquipment} from './view_adventure_equipment.js';
import {renderGems} from './view_adventure_gems.js';
import {renderMembership} from './view_adventure_membership.js';
import {renderNpcServices} from './view_adventure_npc.js';
import {renderPetCollection,petPortrait} from './view_adventure_pets.js';
import {renderQuestJournal} from './view_adventure_quests.js';
import {renderRecharge} from './view_adventure_recharge.js';
import {renderSettings,settingsView} from './view_adventure_settings.js';
import {renderShop} from './view_adventure_shop.js';
import {renderStrengthening} from './view_adventure_strengthening.js';
import {renderWorldMap} from './view_adventure_world_map.js';
import {renderLearningMode} from '../../learning/view_learning_mode.js';
import {el,button,icon,art,tile,modal,spellHint,spellFace} from './primitives.js';
import {objectiveLabel,gourdArt,updateCheckin} from './view_hud.js';

export {settingsView};

function mentorOpponentArt(assets,unit){
    const monster=assets.content.monsters[unit.id==='enemy2'?'life-scout':'fire-scout'];
    const binding=monsterArtBinding(monster,assets.monsterArt);
    if(binding?.kind==='pet')return petPortrait(assets,binding.petId,0,64);
    const canvas=el('canvas','art');canvas.width=128;canvas.height=160;canvas.style.width='64px';canvas.style.height='80px';
    const draw=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,128,160);assets.drawMonster(ctx,monster,0,0,128,160);};
    draw();
    if(binding?.kind==='portrait')void assets.ensureImage('monster:'+binding.id).then(()=>{if(canvas.isConnected)draw();}).catch(()=>{});
    return canvas;
}
export function updateMentorPracticeHealth(field,lesson,cast){
    if(!field)return;
    for(const unit of field.querySelectorAll('[data-unit-id]')){
        const id=unit.dataset.unitId,hp=cast.afterHp[id],max=lesson.arena.unitsById[id].maxHp;
        unit.setAttribute('aria-label',`${mentorPracticeName(id,lesson.language)} ${hp} / ${max}`);
        unit.querySelector('.mentor-hp').textContent=`${hp} / ${max}`;
        unit.querySelector('progress').value=hp;
    }
}
export function renderMentorPractice(root,model,lesson,cb){
    const {assets,save}=model,body=modal(root,lesson.title,'导师实操 · 借用练习卡，不消耗背包',cb);
    root.classList.add('mentor-practice-layer');
    const npc=assets.content.npcs[lesson.npcId],speaker=el('div','practice-speaker');
    if(npc?.portrait)speaker.append(art(assets,npc.portrait,60,74));
    speaker.append(el('p','',lesson.presentation?'施法中，观察卡牌对目标的效果。':lesson.message));speaker.setAttribute('role','status');body.append(speaker);
    const cue=el('div','mentor-cue',el('strong','',mentorPracticeCue(lesson)),button('听指令',cb.listen,'secondary'),button(lesson.hint?'收起提示':'看提示',cb.hint,'secondary'));
    cue.firstChild.lang=lesson.language;
    if(lesson.hint)cue.append(el('p','mentor-hint',mentorPracticeCue(lesson,save.languageLearning?.native||'zh')));
    body.append(cue);
    const field=el('div','mentor-field');
    for(const side of ['near','far']){
        const group=el('div','mentor-team');
        for(const unit of lesson.arena.sides[side]){
            const image=unit.id==='student'?heroPortrait(assets,save,64,80):unit.id==='companion'?petPortrait(assets,OPENING_PET,0,64):mentorOpponentArt(assets,unit);
            const hp=lesson.presentation?.beforeHp[unit.id]??unit.hp;
            const name=mentorPracticeName(unit.id,lesson.language),target=button([image,el('strong','',name),el('span','mentor-hp',`${hp} / ${unit.maxHp}`)],()=>cb.target(unit.id),'practice-partner');
            target.setAttribute('aria-label',`${name} ${hp} / ${unit.maxHp}`);
            target.dataset.unitId=unit.id;target.disabled=!!lesson.presentation||lesson.done||lesson.failed||unit.hp===0;
            const health=el('progress','');health.max=unit.maxHp;health.value=hp;health.setAttribute('aria-label',name);target.append(health);group.append(target);
        }
        field.append(group);
    }
    body.append(field);
    if(!lesson.presentation&&lesson.feedback.length)body.append(el('p','mentor-feedback',lesson.feedback.map(f=>`${mentorPracticeName(f.id,lesson.language)} ${f.delta>0?'+':''}${f.delta}`).join(' · ')));
    if(lesson.done&&!lesson.presentation)body.append(button('完成导师练习',cb.complete,'primary'));
    else if(lesson.failed&&!lesson.presentation)body.append(button('重新练习',cb.retry,'primary'));
    else{
        const cards=el('div','practice-cards');
        for(const key of lesson.keys){
            const card=lesson.arena.resolved.cards[key],original=assets.dataset.cards[key];
            const pick=button([spellFace(assets,card,original),el('span','practice-card-caption',spellHint(card,assets.dataset))],()=>cb.select(key),'practice-card'+(lesson.selected===key?' selected':''));
            pick.disabled=!!lesson.presentation;pick.setAttribute('aria-label','选择'+original.name);pick.setAttribute('aria-pressed',String(lesson.selected===key));cards.append(pick);
        }
        body.append(cards);
    }
    if(!lesson.presentation)body.querySelector(lesson.done||lesson.failed?'.primary':'.practice-card.selected')?.focus({preventScroll:true});
}

export function renderCompanionPractice(root,model,lesson,cb){
    const body=modal(root,'和伙伴配合','茜茜的练习卡 · 不消耗背包',cb);
    root.classList.add('companion-practice-layer');
    const npc=model.assets.content.npcs[36200];
    const speaker=el('div','practice-speaker');
    if(lesson.done)speaker.append(petPortrait(model.assets,OPENING_PET,0,72));
    else if(npc?.portrait)speaker.append(art(model.assets,npc.portrait,72,88));
    speaker.append(el('p','',lesson.message));speaker.setAttribute('role','status');body.append(speaker);
    const partner=lesson.arena.unitsById.companion;
    const target=button([petPortrait(model.assets,OPENING_PET,0,112),el('strong','','咕噜噜'),el('span','',`${partner.hp} / ${partner.maxHp}`)],cb.target,'practice-partner'+(lesson.done?' recovered':lesson.selected?' ready':''));
    target.setAttribute('aria-label',`帮助咕噜噜，生命 ${partner.hp} / ${partner.maxHp}`);
    const health=el('progress','');health.max=partner.maxHp;health.value=partner.hp;health.setAttribute('aria-label','咕噜噜生命');target.append(health);
    target.disabled=lesson.done;body.append(target);
    if(lesson.done){
        body.append(el('p','practice-recovery',`恢复了 ${lesson.recovered} 点生命`),button('我会配合了，继续出发',cb.complete,'primary'));
    }else{
        const cards=el('div','practice-cards');
        for(const key of lesson.keys){
            const card=lesson.arena.resolved.cards[key],name=model.assets.dataset.cards[key]?.name||key;
            const pick=button([spellFace(model.assets,card,model.assets.dataset.cards[key]),el('span','practice-card-caption',spellHint(card,model.assets.dataset))],()=>cb.select(key),'practice-card'+(lesson.selected===key?' selected':''));
            pick.setAttribute('aria-label','练习：选择'+name);pick.setAttribute('aria-pressed',String(lesson.selected===key));cards.append(pick);
        }
        body.append(cards);
    }
    body.querySelector(lesson.done?'.primary':'.practice-card.selected')?.focus({preventScroll:true});
}
export function renderPanel(root,kind,model,cb) {
    const {assets,save}=model,c=assets.content;
    if(kind==='recharge'){
        renderRecharge(modal(root,'会员充值','',cb,true),model,cb,{el,button});return;
    }
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
    const titles={'learning-mode':['双语学习','遇见居民 · 开口交流'],'npc-services':['居民商店与课程',''],checkin:['米酒葫芦','在线相伴 · 每日好礼'],debug:['属性编辑器','调试工具 · 修改当前存档'],shop:['哈奇商城',''],equipment:['我的背包',''],quests:['冒险手记','全岛任务'],inventory:['我的背包',''],deck:['我的魔法卡包','准备你的魔法'],pet:['我的小伙伴','拖动移动角色'],settings:['旅途设置','你的冒险旅程'],map:['世界地图','魔法哈奇']};
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
    if(kind==='deck') root.deckPreview=renderDeckEditor(body,model,cb,{el,button,spellFace});
    if(kind==='pet'&&!c.pets){
        body.append(el('h3','','初心之旅 · 咕噜噜教学'));
        body.append(el('div','pet-portrait',tile(assets,'creatures',save.pet?6:7,170,180)));
        if(save.pet)body.append(el('h3','center',save.pet.name),el('p','center muted',fill('等级 {level} · 经验 {xp} · 教学伙伴',{level:save.pet.level,xp:save.pet.xp}).text),el('p','center','小小的咕噜噜，已经认定你是它最好的朋友。'),el('p','center muted',fill('战宠口粮 {count} 包 · 每包增加 {xp} 经验',{count:save.inventory[17172]||0,xp:c.pet.foodXp}).text),button('喂养一包战宠口粮',()=>cb.action({type:'feed'}),'primary centered'));
        else body.append(el('h3','center','等待与你相遇'),el('p','center muted','完成青龙的强化指导，即可获得一枚出奇蛋。'),ownsEgg(save)?button('打开出奇蛋',()=>cb.action({type:'hatch'}),'primary centered'):el('p','center','继续你的冒险吧。'));
    }
    if(kind==='debug'){body.closest('.modal').classList.add('debug-modal');renderDebugEditor(body,model,cb,{el,button});}
    if(kind==='learning-mode'){body.closest('.modal').classList.add('learning-mode-modal');renderLearningMode(body,model,cb,{el,button});}
    if(kind==='settings') {
        renderSettings(body,model,cb,{el,button});
    }
    if(kind==='map') {
        renderWorldMap(body,model,cb,{el,button});
    }
}
function ownsEgg(save){return (save.inventory[17307]||0)>0;}

export function capturePanelFocusState(overlay, activePanel) {
    const equipment = ['equipment', 'inventory', 'shop', 'pet'].includes(activePanel);
    if (!equipment || !overlay) return { equipment: false, scroll: 0, focusLabel: null, focusedMount: null };
    const scroll = overlay.querySelector('.modal-body')?.scrollTop || 0;
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const focused = !!(activeEl && overlay.contains(activeEl));
    const focusLabel = focused ? activeEl.getAttribute('aria-label') || activeEl.textContent : null;
    const focusedMount = activePanel === 'pet' && focused ? activeEl.dataset?.mountId || null : null;
    return { equipment: true, scroll, focusLabel, focusedMount };
}

export function restorePanelFocusState(overlay, state) {
    if (!state?.equipment || !overlay) return;
    const body = overlay.querySelector('.modal-body');
    if (body) body.scrollTop = state.scroll;
    if (state.focusLabel) {
        const buttons = [...overlay.querySelectorAll('button')];
        (
            buttons.find(b => (state.focusedMount ? b.dataset.mountId === state.focusedMount : (b.getAttribute('aria-label') || b.textContent) === state.focusLabel))
            || overlay.querySelector('.equipment-detail button:not(:disabled)')
        )?.focus({ preventScroll: true });
    }
}

export function renderOverlayCard(overlay, message, actions = []) {
    if (!overlay) return;
    overlay.className = 'overlay visible';
    overlay.replaceChildren(
        el('section', 'loading-card', el('p', '', message), ...actions.map(a => button(a.label, a.onClick, a.className || ''))),
    );
}
