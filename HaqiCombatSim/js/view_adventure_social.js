import {companionPet} from './view_party_companion_pet.js';
import {renderSocialActions,socialActionsHeading} from './view_social_actions.js';
import {renderRedMushroom} from './view_red_mushroom.js';
import {renderFriendChat} from './view_friend_chat.js';
import {languageName} from './character_relationship_core.js';
import {renderPartnerProfile} from './view_adventure_social_profile.js';
import {el,button} from './view_adventure.js';
import {createCloseButton} from './view_adventure_controls.js';
import {dungeonStaminaHint} from './adventure_stamina_core.js';
import {tr,fill} from './locale_runtime.js';
import {drawSchoolIcon} from './card_renderer.js';
const schoolNames={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
export function renderSocial(root,state,kind,cb){
    const sameMatch=kind==='social-pvp'&&state.pvp?.matchId&&root.dataset.arenaMatch===state.pvp.matchId;
    const arenaScroll=sameMatch?(root.querySelector('.modal-body')?.scrollTop||0):0;
    const arenaFocus=sameMatch&&root.contains(document.activeElement);
    root.dataset.arenaMatch=kind==='social-pvp'?state.pvp?.matchId||'':'';
    root.replaceChildren();root.className='overlay visible'+(kind==='social-actions'?' social-actions-overlay':'');
    root.onclick=kind==='social-actions'?event=>{if(event.target===root)cb.close();}:null;
    const title=kind==='social-actions'&&state.selected?socialActionsHeading(state):{mail:'邮件与好友',chat:'玩家与好友','social-party':state.partyDungeon?fill(`组队 · {v0}`,{v0:String(state.partyDungeon.name)}).text:'副本组队','social-profile':'伙伴名片','social-pvp':'红蘑菇赛场'}[kind]||'冒险伙伴';
    const box=el('section','modal social-modal');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    const body=el('div','modal-body');box.append(el('header','modal-header',el('h2','',title),createCloseButton(cb.close)),body);root.append(box);
    if(state.busy)body.append(el('p','muted',kind==='social-pvp'?'正在准备赛场…':'正在连接…'));
    if(state.error)body.append(el('p','social-error',state.error));
    if(kind==='social-actions'&&state.selected){renderSocialActions(box,body,state,cb);return;}
    if(kind==='social-profile'&&state.selected){box.classList.add('partner-profile-modal');renderPartnerProfile(body,state,cb);return;}
    if(kind==='chat'){renderFriendChat(box,body,state,cb);return;}
    if(kind==='mail'){
        if(!state.owner){body.append(el('p','','登录后可以与好友通信。'),button('登录 Keepwork',cb.login,'primary'));return;}
        body.append(button('刷新',cb.refresh,'secondary'));
        const tabs=el('div','gui-tabs');for(const [key,label]of [['inbox','收件箱'],['compose','写信'],['friends','好友与申请']]){const b=button(label,()=>cb.mailTab(key));b.setAttribute('aria-pressed',String((state.mailTab||'inbox')===key));tabs.append(b);}body.append(tabs);
        if(!state.mailAvailable&&state.mailTab!=='friends'){body.append(el('p','muted','邮件服务正在验证中，可先管理好友申请。'));return;}
        if(state.mailTab==='friends'){
            for(const p of state.applies)body.append(el('div','social-row',el('span','',p.user?.nickname||p.user?.username||p.nickname||'好友申请'),button('同意',()=>cb.apply(p.id,true),'primary'),button('拒绝',()=>cb.apply(p.id,false),'secondary')));
            for(const f of state.friends)body.append(el('div','social-row',el('span','',f.name),button('写信',()=>cb.compose(f),'secondary'),button('邀请组队',()=>cb.recruitFriend(f),'secondary')));
            if(!state.friends.length&&!state.applies.length)body.append(el('p','','在岛上认识伙伴后，可以从人物资料添加好友。'));
        }else if(state.mailTab==='compose'){
            const select=el('select','social-compose');select.setAttribute('aria-label','收件人');select.append(el('option','','请选择好友'));for(const f of state.friends){const o=el('option','',f.name);o.value=f.userId;select.append(o);}select.value=state.recipient||'';select.onchange=()=>cb.draft('recipient',select.value);
            const subject=el('input','social-compose');subject.placeholder='标题';subject.maxLength=100;subject.value=state.subject||'';subject.oninput=()=>cb.draft('subject',subject.value);
            const text=el('textarea','social-compose');text.placeholder='给朋友写几句话吧';text.maxLength=2000;text.value=state.mailDraft||'';text.oninput=()=>cb.draft('mailDraft',text.value);
            const send=button('发送邮件',()=>cb.sendMail(select.value,subject.value,text.value),'primary');send.disabled=!!state.busy;body.append(select,subject,text,button('翻译成英文草稿',()=>cb.polish('mailDraft','en'),'secondary'),button('润色中文草稿',()=>cb.polish('mailDraft','zh'),'secondary'),el('p','muted','AI 生成草稿，可修改后自行发送。'),send);
        }else{
            for(const m of state.mails)body.append(button(`${m.read?'':'未读 · '}${m.title}`,()=>cb.readMail(m.id),'social-mail-row secondary'));
            if(!state.mails.length)body.append(el('p','','暂无来信。'));
            if(state.mailDetail)body.append(el('article','social-letter',el('h3','',state.mailDetail.title),el('p','',state.mailDetail.content)));
        }
        return;
    }
    if(kind==='social-pvp'){
        renderRedMushroom(box,body,state,cb);
        if(sameMatch&&!state.pvp.arena.finished){body.scrollTop=arenaScroll;if(arenaFocus)body.querySelector('.arena-card,.arena-actions>button')?.focus({preventScroll:true});}
        return;
    }
    if(kind==='social-party'){
        box.classList.add('party-room-modal');
        const dungeon=state.partyDungeon,frozen=state.coopActive,canCoop=state.coopCapable!==false&&!!dungeon;
        const heading=el('div','party-room-heading'),tip=el('div','party-room-hint');tip.id='party-room-hint';
        const hintLines=[];
        if(dungeon?.kind==='tower')hintLines.push(fill(`本次 {v0}v{v1} · 层数跨模式共享`,{v0:String(state.lineupCount||1),v1:String(state.lineupCount||1)}).text);
        else if(dungeon?.kind)hintLines.push(fill(`固定 {v0}v{v1} · 可使用宠物或组队`,{v0:String(dungeon.partySize),v1:String(dungeon.partySize)}).text);
        if(dungeon?.kind)hintLines.push('按阵位顺序选取出战单位，多余伙伴作为候补；没有组队伙伴时使用当前宠物阵容。');
        if(dungeon){
            hintLines.push(fill(`首领：{v0} · 建议 {v1} 级`,{v0:String(dungeon.boss?.name||'未知'),v1:String(dungeon.recommendedLevel||1)}).text);
            const stamina=dungeonStaminaHint(dungeon);
            if(stamina)hintLines.push(stamina.min===stamina.max?fill(`战斗消耗精力 {v0}`,{v0:String(stamina.max)}).text:fill(`战斗消耗精力 {v0}–{v1}`,{v0:String(stamina.min),v1:String(stamina.max)}).text);
            hintLines.push(canCoop?'开放空位后，伙伴会自动加入；也可在下方主动邀请。':'此副本暂仅支持单人出发。');
        }else hintLines.push('尚未选择副本');
        if(frozen)hintLines.push('队伍已冻结。退出当前副本后才能更换伙伴。');
        for(const line of hintLines)tip.append(el('p','',line));
        const titleButton=button(title,()=>{
            const open=heading.classList.toggle('open');
            titleButton.setAttribute('aria-expanded',String(open));
        },'party-room-title');
        titleButton.setAttribute('aria-expanded','false');
        titleButton.setAttribute('aria-describedby','party-room-hint');
        heading.append(el('h2','',titleButton),tip);
        box.querySelector('.modal-header h2').replaceWith(heading);
        const seats=el('div','party-seats');
        const schoolLabel=p=>schoolNames[p.school]||p.school||'魔法';
        const schoolIcon=school=>{
            const name=schoolNames[school]||'魔法';
            const canvas=el('canvas','party-seat-school');canvas.width=32;canvas.height=32;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill(`{v0}系`,{v0:String(name)}).text);
            const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school||'balance',16,16,24);return canvas;
        };
        const self=state.hero||{name:'你',school:'',level:1,kind:'self'};
        const seatPortrait=p=>el('div','party-seat-portrait',cb.portrait(p,62,72),companionPet(p,state,cb));
        const identity=(card,p)=>{
            const name=p.name||'你',school=schoolLabel(p),level=p.level||1;
            card.append(seatPortrait(p),el('h3','',name),el('p','party-seat-meta',schoolIcon(p.school),el('span','',fill(`{v0} 级`,{v0:String(level)}).text)));
            card.title=fill(`{v0} · {v1} · {v2} 级`,{v0:String(name),v1:String(school),v2:String(level)}).text;
        };
        const selfCard=el('article','party-seat filled captain',el('span','party-seat-tag','队长'));
        identity(selfCard,self);seats.append(selfCard);
        if(state.localSecond){const card=el('article','party-seat filled',el('span','party-seat-tag','队员'));identity(card,state.localSecond);seats.append(card);}
        for(let i=0;i<(state.teamCapacity??3);i++){
            const ally=state.allies[i],open=state.openSlots[i],card=el('article',`party-seat ${ally?'filled':open?'open':'empty'}`);
            if(ally){
                card.append(el('span','party-seat-tag','队员'));identity(card,ally);
                const actions=el('div','party-seat-actions',button('名片',()=>cb.profile(ally),'secondary'));
                if(!frozen)actions.append(button('移出',()=>cb.team(ally,false),'secondary'));
                card.append(actions);
            }else if(open){
                card.append(el('span','party-seat-tag','等候中'),el('div','party-seat-portrait party-seat-waiting'),el('h3','','席位已开放'));
                card.title=tr('伙伴即将自动加入…');
                if(!frozen)card.append(el('div','party-seat-actions',button('取消开放',()=>cb.openSlot(i),'secondary')));
            }else{
                const why=dungeon?(canCoop?'点击开放，等候加入':'单人副本无需组队'):'请先选择副本';
                card.append(el('span','party-seat-tag',fill(`空位 {v0}`,{v0:String(i+2)}).text),el('div','party-seat-portrait party-seat-empty'),el('h3','','空位'));
                card.title=tr(why);
                const openBtn=button('开放',()=>cb.openSlot(i),'primary');openBtn.disabled=frozen||!dungeon||!canCoop;openBtn.title=tr(why);
                card.append(el('div','party-seat-actions',openBtn));
            }
            seats.append(card);
        }
        body.append(seats);
        const footer=el('div','party-room-footer');
        if(!frozen){
            if(!dungeon)footer.append(button('选择副本',cb.pickDungeon,'primary'));
            else{
                const go=button(state.partyRestart?'重新挑战':'立即出发',cb.depart,'primary');
                go.disabled=state.openSlots.some(Boolean);
                footer.append(go,button('更换副本',cb.pickDungeon,'secondary'));
                if(dungeon.kind&&!state.allies.some(Boolean))footer.append(button('调整宠物阵容',()=>cb.open('pet'),'secondary'));
            }
        }
        if(state.coopReport?.length){body.append(el('h3','','队伍战报'));for(const [i,r]of state.coopReport.entries())body.append(el('p','',fill(`第 {v0} 场 · {v1} · {v2} 回合`,{v0:String(i+1),v1:String(r.winner==='near'?'获胜':'未获胜'),v2:String(r.turns)}).text));}
        if(state.owner)footer.append(button(state.publicVisible===false?'开启公开展示':'关闭公开展示',cb.togglePublic,'secondary'));
        body.append(footer);
        if(!frozen&&dungeon){
            body.append(el('h3','','主动邀请'));
            if(!canCoop)body.append(el('p','muted','当前副本不支持组队邀请。'));
            for(const p of state.roster){
                const joined=state.team.some(t=>t.id===p.id),card=el('article','social-person',el('h3','',p.name),el('p','',fill(`{v0} · 母语{v1} · 正在学{v2}`,{v0:String(schoolNames[p.school]||p.school),v1:String(languageName(p.native)),v2:String(languageName(p.target))}).text),el('p','muted',p.interest||''));
                const join=button(joined?'移出队伍':'邀请组队',()=>cb.team(p,!joined),'primary');join.disabled=!canCoop||(!joined&&state.team.length>=(state.teamCapacity??3));
                card.append(button('查看名片',()=>cb.profile(p),'secondary'),join,button('交谈',()=>cb.talk(p),'secondary'));
                if(p.kind==='account'){const friend=state.friends.find(f=>f.userId===String(p.userId));card.append(button(friend?'写信':'添加好友',()=>friend?cb.compose(friend):cb.friend(p),'secondary'));if(friend)card.append(button('私聊',()=>cb.privateChat(friend),'secondary'));}
                body.append(card);
            }
        }
        if(state.dialogue){body.append(el('p','muted','AI 生成'),el('p','social-letter',state.dialogue.reply||'你好，一起冒险吧。'));const input=el('textarea','social-compose');input.setAttribute('aria-label','对伙伴说');body.append(input,button('发送',()=>cb.reply(input.value),'primary'));}
        return;
    }
    const rows=kind==='social-profile'&&state.selected?[state.selected]:state.roster;
    for(const p of rows){
        const card=el('article','social-person',el('h3','',p.name),el('p','',fill(`{v0} · 母语{v1} · 正在学{v2}`,{v0:String(schoolNames[p.school]||p.school),v1:String(languageName(p.native)),v2:String(languageName(p.target))}).text),el('p','muted',p.interest||''));
        if(kind==='social-pvp')card.append(button('开始切磋',()=>cb.challenge(p),'primary'));
        else{const joined=state.team.some(t=>t.id===p.id),join=button(joined?'移出队伍':'邀请组队',()=>cb.team(p,!joined),'primary');join.disabled=state.coopActive||!joined&&state.team.length>=(state.teamCapacity??3);card.append(button('查看名片',()=>cb.profile(p),'secondary'),join,button('交谈',()=>cb.talk(p),'secondary'));
            if(p.kind==='account'){const friend=state.friends.find(f=>f.userId===String(p.userId));card.append(button(friend?'写信':'添加好友',()=>friend?cb.compose(friend):cb.friend(p),'secondary'));if(friend)card.append(button('私聊',()=>cb.privateChat(friend),'secondary'));}}
        body.append(card);
    }
    if(state.dialogue){body.append(el('p','muted','AI 生成'),el('p','social-letter',state.dialogue.reply||'你好，一起冒险吧。'));const input=el('textarea','social-compose');input.setAttribute('aria-label','对伙伴说');body.append(input,button('发送',()=>cb.reply(input.value),'primary'));}
}
