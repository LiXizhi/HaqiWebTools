import {setText,fill} from '../../locale_runtime.js';
import {OPENING_PET} from '../../opening_journey_core.js';
import {renderDebugEditor} from '../../view_adventure_debug.js';
import {renderDeckEditor} from '../../view_adventure_deck.js';
import {renderEquipment} from '../../view_adventure_equipment.js';
import {renderGems} from '../../view_adventure_gems.js';
import {renderMembership} from '../../view_adventure_membership.js';
import {renderNpcServices} from '../../view_adventure_npc.js';
import {renderPetCollection,petPortrait} from '../../view_adventure_pets.js';
import {renderQuestJournal} from '../../view_adventure_quests.js';
import {renderRecharge} from '../../view_adventure_recharge.js';
import {renderSettings,settingsView} from '../../view_adventure_settings.js';
import {renderShop} from '../../view_adventure_shop.js';
import {renderStrengthening} from '../../view_adventure_strengthening.js';
import {renderWorldMap} from '../../view_adventure_world_map.js';
import {renderLearningMode} from '../../view_learning_mode.js';
import {el,button,icon,art,tile,modal,spellHint,spellFace} from './primitives.js';
import {objectiveLabel,gourdArt,updateCheckin} from './view_hud.js';

export {settingsView};

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
