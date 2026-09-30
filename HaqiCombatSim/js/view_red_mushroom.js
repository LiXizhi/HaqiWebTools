import {el,button} from './view_adventure.js';
import {petPortrait} from './view_adventure_pets.js';
import {drawSchoolIcon} from './card_renderer.js';

const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
const modes=['独当一面','双星并肩','三人协作','全队出击'];
function portrait(p,cb){return p?.speciesId?petPortrait(cb.assets(),p.speciesId,p.appearanceStage??2,84):cb.portrait(p,84,98);}
function stats(state){
    const r=state.arenaRecord,recent=r.recent||[],wins=recent.filter(p=>p.result==='win').length;
    return el('div','arena-record',el('span','',`已赛 ${r.total} 场`),el('strong','',`胜率 ${r.total?Math.round(r.wins/r.total*100)+'%':'—'}`),el('span','',`${r.wins} 胜 / ${r.draws} 平 / ${r.losses} 负`),el('span','',`近期 ${recent.length} 场 · ${recent.length?Math.round(wins/recent.length*100)+'%':'—'}`));
}
function banner(title,subtitle){return el('div','arena-banner',el('div','arena-emblem',el('span','','红'),el('small','','蘑菇赛场')),el('div','',el('p','arena-eyebrow','勇气 · 配合 · 成长'),el('h3','',title),el('p','',subtitle)));}
export function renderRedMushroom(box,body,state,cb){
    box.classList.add('arena-modal','party-room-modal');
    body.append(stats(state));
    if(state.arenaStorageWarning)body.append(el('p','social-error','本地数据库不可用，战绩暂存于内存，关闭页面后将丢失。'));
    if(state.pvp){renderMatch(body,state,cb);return;}
    if(state.arenaStep!=='team'){
        body.append(banner('在红蘑菇，遇见旗鼓相当的对手','选好赛制，带上宠物，或招募伙伴并肩出战。'));
        const cards=el('div','arena-modes');
        for(let n=1;n<=4;n++){
            const b=button('',()=>cb.arenaMode(n),'arena-mode');b.disabled=state.busy;
            b.append(el('strong','',`${n} 对 ${n}`),el('span','',modes[n-1]),el('small','',n===1?'主角单人出战':`主角 + ${n-1} 位宠物或伙伴`));cards.append(b);
        }
        body.append(cards,el('div','arena-rules',el('h4','','赛场小贴士'),el('p','','每日首场对手较温和，后续按近期战绩匹配实力。胜负取决于你的配卡与出牌。'),el('p','','满血入场，不消耗物品、精力或饥饿。伙伴与对手均由 AI 操控；每轮限时30秒选牌，超时跳过；最后5秒有声音提醒。'),el('p','muted','卡包打空或回合耗尽时，剩余生命比例高的一方获胜，相同则平局。')));
        return;
    }
    const n=state.arenaMode;
    body.append(banner(`${n} 对 ${n} · 我的出战小队`,'主角坐镇，宠物助阵。招募伙伴即可替换对应宠物席位。'),button('更换赛制',cb.arenaBack,'secondary'));
    const seats=el('div','party-seats arena-seats');
    for(let i=0;i<4;i++){
        const p=state.arenaSeats[i],active=i<n;
        const card=el('article',`party-seat arena-seat ${active?'filled':'arena-rest'}`);
        card.append(el('span','party-seat-tag',!active?'休战席':i===0?'队长':p?.kind==='ally'?'AI 伙伴':p?'宠物':'待招募'));
        if(p&&active)card.append(el('div','party-seat-portrait',portrait(p,cb)),el('h3','',p.name),el('p','',`${schools[p.school]||'魔法'} · ${p.level} 级`));
        else card.append(el('div','party-seat-portrait party-seat-empty'),el('h3','',active?'虚位以待':'本场休战'),el('p','muted',active?'招募一位伙伴补齐阵容':`${n} 对 ${n} 使用前 ${n} 席`));
        if(i&&active){
            const actions=el('div','party-seat-actions',button(p?.kind==='ally'?'更换伙伴':'招募伙伴',()=>cb.arenaRecruit(i-1),'secondary'));
            if(p?.kind==='ally')actions.append(button('移出伙伴',()=>cb.arenaInvite(i-1,null),'secondary'));
            card.append(actions);
        }
        seats.append(card);
    }
    body.append(seats);
    if(state.arenaRecruit!==null){
        const index=state.arenaRecruit,section=el('section','arena-recruit',el('h4','',`为第 ${index+2} 席招募伙伴`),el('p','muted','与副本组队一样，伙伴以 AI 快照随队，不要求同时在线。'));
        section.append(button('自动招募',()=>cb.arenaAutoRecruit(index),'primary'),button('收起名单',()=>cb.arenaRecruit(null),'secondary'));
        const candidates=state.roster.filter(p=>!state.arenaAllies.some(a=>a?.id===p.id));
        for(const p of candidates){const b=button(`邀请 ${p.name} · ${schools[p.school]||'魔法'} · ${p.level}级`,()=>cb.arenaInvite(index,p),'secondary');section.append(b);}
        body.append(section);
    }
    const ready=state.arenaSeats.slice(0,n).every(Boolean),go=button('进入红蘑菇赛场',cb.arenaStart,'primary');go.disabled=!ready||state.busy;
    body.append(el('div','party-room-footer',el('p','muted',ready?'小队已就绪 · 对手将在入场时匹配':'请招募伙伴补齐出战席位'),go));
}
function renderMatch(body,state,cb){
    const match=state.pvp,a=match.arena,matching=!!state.arenaMatching;
    body.append(banner(`${match.replay.mode} 对 ${match.replay.mode} · ${matching?'对手集结中':'匹配成功'}`,matching?'红蘑菇战队正在依次加入赛场':match.replay.difficulty.first?'今日首场 · 热身挑战':'实力匹配 · 红蘑菇战队'));
    const field=el('div','arena-field');
    for(const [side,label]of [['near','我的小队'],['far','红蘑菇战队']]){
        const team=el('section',`arena-team ${side}`,el('h4','',label)),row=el('div','arena-fighters');
        for(const [i,u]of a.sides[side].entries()){
            if(side==='far'&&matching&&i>=state.arenaJoined){
                const waiting=el('article','arena-fighter arena-fighter-waiting',el('div','arena-fighter-art',el('span','arena-arrival-ring')),el('strong','','等待对手加入'),el('small','',`第 ${i+1} 席 · 正在集结`));
                row.append(waiting);continue;
            }
            const icon=el('canvas','arena-name-school');icon.width=32;icon.height=32;icon.setAttribute('role','img');icon.setAttribute('aria-label',`${schools[u.school]||'平衡'}系`);drawSchoolIcon(icon.getContext('2d'),u.school||'balance',16,16,24);
            const p=match.replay[side][i],card=el('article',`arena-fighter ${u.hp<=0?'defeated':''}`,el('div','arena-fighter-art',portrait(p,cb)),el('strong','arena-fighter-name',icon,el('span','',u.name)));
            const elapsed=Date.now()-(state.arenaJoinedAt?.[i]??0);
            if(side==='far'&&elapsed<500){card.classList.add('arena-fighter-arriving');card.style.animationDelay=`-${Math.max(0,elapsed)}ms`;}
            const hp=el('progress','');hp.max=u.maxHp;hp.value=Math.max(0,u.hp);hp.setAttribute('aria-label',`${u.name}生命`);
            card.append(hp,el('small','',`${Math.max(0,u.hp)} / ${u.maxHp}`),el('small','',u.hp<=0?'已退场':`能量 ${u.pips.normal} · 强能量 ${u.pips.power}`));row.append(card);
        }
        team.append(row);field.append(team);
    }
    body.append(field);
    if(matching){
        const progress=el('progress','arena-arrival-progress');progress.max=match.replay.mode;progress.value=state.arenaJoined;progress.setAttribute('aria-label','对手到场人数');
        const status=el('div','arena-ready',el('h3','',`对手已到场 ${state.arenaJoined} / ${match.replay.mode}`),progress,el('p','','等待对方全员到齐后，开始15秒准备倒计时。'));
        status.setAttribute('role','status');const wait=button('等待对手到齐',()=>{},'primary');wait.disabled=true;status.append(wait);body.append(status);return;
    }
    const countdown=el('p','',`准备好迎战！${state.arenaReadySeconds??15} 秒后自动进入战斗法阵。`);countdown.dataset.arenaReady='';
    body.append(el('div','arena-ready',el('h3','','匹配成功'),countdown,button('我准备好了',cb.arenaReady,'primary')));
}
