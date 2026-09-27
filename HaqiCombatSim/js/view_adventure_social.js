import {renderFriendChat} from './view_friend_chat.js';
import {languageName} from './character_relationship_core.js';
import {defeatReviewNotes} from './view_battle_review.js';
import {renderPartnerProfile} from './view_adventure_social_profile.js';
import {el,button} from './view_adventure.js';
import {createCloseButton} from './view_adventure_controls.js';
import {castableCards,validTargets} from './combat_arena_core.js';
import {dungeonStaminaHint} from './adventure_stamina_core.js';
const schoolNames={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
export function renderSocial(root,state,kind,cb){
    root.replaceChildren();root.className='overlay visible';
    const title={mail:'邮件与好友',chat:'玩家与好友','social-party':state.partyDungeon?`组队 · ${state.partyDungeon.name}`:'副本组队','social-profile':'伙伴名片','social-pvp':'红蘑菇赛场'}[kind]||'冒险伙伴';
    const box=el('section','modal social-modal');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',title);
    const body=el('div','modal-body');box.append(el('header','modal-header',el('h2','',title),createCloseButton(cb.close)),body);root.append(box);
    if(state.busy)body.append(el('p','muted','正在连接…'));
    if(state.error)body.append(el('p','social-error',state.error));
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
    if(kind==='social-pvp'&&state.pvp){
        const a=state.pvp.arena;body.append(el('p','',`第 ${a.turn} 回合 · ${a.sides.near[0].hp} / ${a.sides.near[0].maxHp} 生命 · 对手 ${a.sides.far[0].hp} / ${a.sides.far[0].maxHp}`));
        if(a.finished){const review=state.pvp.review;body.append(el('h3','',review?.presentation?.headline||(a.winner==='near'?'切磋获胜':a.winner==='far'?'再接再厉':'本场平局')));const notes=defeatReviewNotes(review,a.winner);if(notes.length)body.append(el('details','',el('summary','','查看复盘'),...notes.map(note=>el('p','',note))));body.append(button('保存战报',cb.exportReplay,'secondary'),button('返回赛场',cb.endPvp,'primary'));return;}
        const hero=a.unitsById.hero;
        for(const c of castableCards(a,hero))for(const target of validTargets(a,hero,c.card))body.append(button(`${cb.cardName(c.key)} → ${target.name}`,()=>cb.pvpPlay({key:c.key,seq:c.seq,targetId:target.id}),'secondary'));
        body.append(button('跳过回合',()=>cb.pvpPlay({pass:true}),'secondary'));return;
    }
    if(kind==='social-pvp'){body.append(el('p','muted','1 对 1 快照切磋，不消耗物品。补位伙伴不计榜。'),el('p','muted',state.rankReady?'娱乐周榜：同一对手每日最多计一次胜场。':'娱乐周榜尚未配置，当前可进行练习切磋。'));if(state.rankReady){body.append(button('刷新周榜',cb.refreshPvp,'secondary'));for(const row of state.pvpRows||[])body.append(el('p','',`${row.name} · ${row.score} 胜场`));}}
    else if(kind==='social-party'){
        box.classList.add('party-room-modal');
        const dungeon=state.partyDungeon,frozen=state.coopActive,canCoop=state.coopCapable!==false&&!!dungeon;
        if(dungeon){
            const change=button(frozen?'查看列表':'更换副本',frozen?()=>cb.open('dungeons'):cb.pickDungeon,'secondary party-dungeon-switch');
            const hint=dungeonStaminaHint(dungeon);
            const detail=el('div','party-dungeon-detail',cb.bossArt?.(dungeon)||el('div','party-dungeon-art'),el('div','party-dungeon-copy',
                el('h3','',dungeon.name),
                el('p','',`首领：${dungeon.boss?.name||'未知'} · 建议 ${dungeon.recommendedLevel||1} 级`),
                hint?el('p','dungeon-stamina',hint.min===hint.max?`战斗消耗精力 ${hint.max}`:`战斗消耗精力 ${hint.min}–${hint.max}`):null,
                el('p','muted',canCoop?'开放空位后，伙伴会自动加入；也可在下方主动邀请。':'此副本暂仅支持单人出发。')
            ),change);
            body.append(detail);
        }else{
            body.append(el('div','party-dungeon-detail party-dungeon-empty',el('p','party-dungeon-line','尚未选择副本'),button('选择副本',cb.pickDungeon,'primary')));
        }
        if(frozen)body.append(el('p','muted','队伍已冻结。退出当前副本后才能更换伙伴。'));
        const seats=el('div','party-seats');
        const schoolLabel=p=>schoolNames[p.school]||p.school||'魔法';
        const self=state.hero||{name:'你',school:'',level:1,kind:'self'};
        const selfCard=el('article','party-seat filled captain',el('span','party-seat-tag','队长'),el('div','party-seat-portrait',cb.portrait(self,72,84)),el('h3','',self.name||'你'),el('p','',`${schoolLabel(self)} · ${self.level||1} 级`),el('p','muted','你'));
        seats.append(selfCard);
        for(let i=0;i<3;i++){
            const ally=state.allies[i],open=state.openSlots[i],card=el('article',`party-seat ${ally?'filled':open?'open':'empty'}`);
            if(ally){
                card.append(el('span','party-seat-tag','队员'),el('div','party-seat-portrait',cb.portrait(ally,72,84)),el('h3','',ally.name),el('p','',`${schoolLabel(ally)} · ${ally.level||1} 级`),el('p','muted',ally.kind==='companion'?'AI 伙伴':'冒险伙伴'));
                const actions=el('div','party-seat-actions',button('名片',()=>cb.profile(ally),'secondary'));
                if(!frozen)actions.append(button('移出',()=>cb.team(ally,false),'secondary'));
                card.append(actions);
            }else if(open){
                card.append(el('span','party-seat-tag','等候中'),el('div','party-seat-portrait party-seat-waiting'),el('h3','','席位已开放'),el('p','muted','伙伴即将自动加入…'));
                if(!frozen)card.append(el('div','party-seat-actions',button('取消开放',()=>cb.openSlot(i),'secondary')));
            }else{
                card.append(el('span','party-seat-tag',`空位 ${i+2}`),el('div','party-seat-portrait party-seat-empty'),el('h3','','空位'),el('p','muted',dungeon?(canCoop?'点击开放，等候加入':'单人副本无需组队'):'请先选择副本'));
                const openBtn=button('开放',()=>cb.openSlot(i),'primary');openBtn.disabled=frozen||!dungeon||!canCoop;card.append(el('div','party-seat-actions',openBtn));
            }
            seats.append(card);
        }
        body.append(seats);
        const footer=el('div','party-room-footer');
        if(!frozen){
            const go=button(state.partyRestart?'重新挑战':'立即出发',cb.depart,'primary');
            go.disabled=!dungeon||state.openSlots.some(Boolean);
            footer.append(go);
        }
        if(state.coopReport?.length){body.append(el('h3','','队伍战报'));for(const [i,r]of state.coopReport.entries())body.append(el('p','',`第 ${i+1} 场 · ${r.winner==='near'?'获胜':'未获胜'} · ${r.turns} 回合`));footer.append(button('保存队伍战报',cb.exportCoop,'secondary'));}
        if(state.owner)footer.append(button(state.publicVisible===false?'开启公开展示':'关闭公开展示',cb.togglePublic,'secondary'));
        body.append(footer);
        if(!frozen&&dungeon){
            body.append(el('h3','','主动邀请'));
            if(!canCoop)body.append(el('p','muted','当前副本不支持组队邀请。'));
            for(const p of state.roster){
                const joined=state.team.some(t=>t.id===p.id),card=el('article','social-person',el('h3','',p.name),el('p','',`${schoolNames[p.school]||p.school} · 母语${languageName(p.native)} · 正在学${languageName(p.target)}`),el('p','muted',p.interest||''));
                const join=button(joined?'移出队伍':'邀请组队',()=>cb.team(p,!joined),'primary');join.disabled=!canCoop||(!joined&&state.team.length>=3);
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
        const card=el('article','social-person',el('h3','',p.name),el('p','',`${schoolNames[p.school]||p.school} · 母语${languageName(p.native)} · 正在学${languageName(p.target)}`),el('p','muted',p.interest||''));
        if(kind==='social-pvp')card.append(button('开始切磋',()=>cb.challenge(p),'primary'));
        else{const joined=state.team.some(t=>t.id===p.id),join=button(joined?'移出队伍':'邀请组队',()=>cb.team(p,!joined),'primary');join.disabled=state.coopActive||!joined&&state.team.length>=3;card.append(button('查看名片',()=>cb.profile(p),'secondary'),join,button('交谈',()=>cb.talk(p),'secondary'));
            if(p.kind==='account'){const friend=state.friends.find(f=>f.userId===String(p.userId));card.append(button(friend?'写信':'添加好友',()=>friend?cb.compose(friend):cb.friend(p),'secondary'));if(friend)card.append(button('私聊',()=>cb.privateChat(friend),'secondary'));}}
        body.append(card);
    }
    if(state.dialogue){body.append(el('p','muted','AI 生成'),el('p','social-letter',state.dialogue.reply||'你好，一起冒险吧。'));const input=el('textarea','social-compose');input.setAttribute('aria-label','对伙伴说');body.append(input,button('发送',()=>cb.reply(input.value),'primary'));}
}
