import {tr,fill} from './locale_runtime.js';
import {el,button} from './view_adventure.js';
import {petPortrait} from './view_adventure_pets.js';
import {drawSchoolIcon} from './card_renderer.js';
import {companionPet} from './view_party_companion_pet.js';

const schools={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'};
const modes=['独当一面','双星并肩','三人协作','全队出击'];
function portrait(p,cb){return p?.speciesId?petPortrait(cb.assets(),p.speciesId,p.appearanceStage??2,84):cb.portrait(p,84,98);}
function schoolIcon(school,cls='arena-name-school'){
    const name=schools[school]||'魔法';
    const canvas=el('canvas',cls);canvas.width=32;canvas.height=32;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill('{school}系',{school:name}).text);
    const context=canvas.getContext('2d');if(context)drawSchoolIcon(context,school||'balance',16,16,24);return canvas;
}
function levelLine(p){return el('p','party-seat-meta',schoolIcon(p.school),el('span','',fill('{level} 级',{level:p.level}).text));}

function stats(state){
    const r=state.arenaRecord,recent=r.recent||[],wins=recent.filter(p=>p.result==='win').length;
    return el('div','arena-record',el('span','',fill(`已赛 {v0} 场`,{v0:String(r.total)}).text),el('strong','',fill(`胜率 {v0}`,{v0:String(r.total?Math.round(r.wins/r.total*100)+'%':'—')}).text),el('span','',fill(`{v0} 胜 / {v1} 平 / {v2} 负`,{v0:String(r.wins),v1:String(r.draws),v2:String(r.losses)}).text),el('span','',fill(`近期 {v0} 场 · {v1}`,{v0:String(recent.length),v1:String(recent.length?Math.round(wins/recent.length*100)+'%':'—')}).text));
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
            b.append(el('strong','',fill(`{v0} 对 {v1}`,{v0:String(n),v1:String(n)}).text),el('span','',modes[n-1]),el('small','',n===1?'主角单人出战':fill(`主角 + {v0} 位宠物或伙伴`,{v0:String(n-1)}).text));cards.append(b);
        }
        body.append(cards,el('div','arena-rules',el('h4','','赛场小贴士'),el('p','','每日首场对手较温和，后续按近期战绩匹配实力。胜负取决于你的配卡与出牌。'),el('p','','满血入场，不消耗物品、精力或饥饿。伙伴与对手均由 AI 操控；每轮限时30秒选牌，超时跳过；最后5秒有声音提醒。'),el('p','muted','卡包打空或回合耗尽时，剩余生命比例高的一方获胜，相同则平局。')));
        return;
    }
    const n=state.arenaMode,bench=state.arenaBench||[];
    const shownSpecies=new Set([...state.arenaSeats.slice(0,n),...bench.slice(0,4-n)].filter(p=>p?.speciesId).map(p=>p.speciesId));
    body.append(banner(fill(`{v0} 对 {v1} · 我的出战小队`,{v0:String(n),v1:String(n)}).text,'主角坐镇，宠物助阵。招募伙伴即可替换对应宠物席位。'),button('更换赛制',cb.arenaBack,'secondary'));
    const seats=el('div','party-seats arena-seats');
    for(let i=0;i<4;i++){
        const active=i<n,p=active?state.arenaSeats[i]:bench[i-n]||null;
        const card=el('article',`party-seat arena-seat ${active?'filled':p?'arena-rest arena-rest-pet':'arena-rest'}`);
        card.append(el('span','party-seat-tag',!active?'休战席':i===0?'队长':p?.kind==='ally'?'AI 伙伴':p?'宠物':'待招募'));
        if(p){
            const art=el('div','party-seat-portrait',portrait(p,cb));
            const pet=companionPet(p,state,cb,shownSpecies);if(pet)art.append(pet);
            card.append(art,el('h3','',p.name),levelLine(p));
            if(!active)card.append(el('p','muted','本场休战'));
        }else card.append(el('div','party-seat-portrait party-seat-empty'),el('h3','',active?'虚位以待':'本场休战'),el('p','muted',active?'招募一位伙伴补齐阵容':fill('{count} 对 {count} 使用前 {count} 席',{count:n}).text));
        if(i&&active){
            const actions=el('div','party-seat-actions',button(p?.kind==='ally'?'更换伙伴':'招募伙伴',()=>cb.arenaRecruit(i-1),'secondary'));
            if(p?.kind==='ally')actions.append(button('移出伙伴',()=>cb.arenaInvite(i-1,null),'secondary'));
            card.append(actions);
        }
        seats.append(card);
    }
    body.append(seats);
    if(bench.length>4-n){
        const extra=el('div','arena-extra-pets',el('span','','其余宠物'));
        for(const p of bench.slice(4-n)){
            const chip=el('span','arena-extra-pet',petPortrait(cb.assets(),p.speciesId,p.appearanceStage??2,40));
            chip.setAttribute('aria-label',p.name);extra.append(chip);
        }
        body.append(extra);
    }
    if(state.arenaRecruit!==null){
        const index=state.arenaRecruit,section=el('section','arena-recruit',el('h4','',fill('为第 {seat} 席招募伙伴',{seat:index+2}).text),el('p','muted','与副本组队一样，伙伴以 AI 快照随队，不要求同时在线。'));
        section.append(button('自动招募',()=>cb.arenaAutoRecruit(index),'primary'),button('收起名单',()=>cb.arenaRecruit(null),'secondary'));
        const candidates=state.roster.filter(p=>!state.arenaAllies.some(a=>a?.id===p.id));
        for(const p of candidates){
            const school=schools[p.school]||'魔法';
            const b=button('',()=>cb.arenaInvite(index,p),'secondary arena-invite');
            b.setAttribute('aria-label',fill('邀请 {name}，{school}系，{level}级',{name:p.name,school,level:p.level}).text);
            b.append(schoolIcon(p.school,'arena-name-school'),document.createTextNode(fill('{name} · {level}级',{name:p.name,level:p.level}).text));
            section.append(b);
        }
        body.append(section);
    }
    const ready=state.arenaSeats.slice(0,n).every(Boolean),go=button('进入红蘑菇赛场',cb.arenaStart,'primary');go.disabled=!ready||state.busy;
    body.append(el('div','party-room-footer',el('p','muted',ready?'小队已就绪 · 对手将在入场时匹配':'请招募伙伴补齐出战席位'),go));
}
function renderMatch(body,state,cb){
    const match=state.pvp,a=match.arena,matching=!!state.arenaMatching;
    body.append(banner(fill('{count} 对 {count} · {status}',{count:match.replay.mode,status:matching?'对手集结中':'匹配成功'}).text,matching?'红蘑菇战队正在依次加入赛场':match.replay.difficulty.first?'今日首场 · 热身挑战':'实力匹配 · 红蘑菇战队'));
    const field=el('div','arena-field');
    for(const [side,label]of [['near','我的小队'],['far','红蘑菇战队']]){
        const team=el('section',`arena-team ${side}`,el('h4','',label)),row=el('div','arena-fighters');
        for(const [i,u]of a.sides[side].entries()){
            if(side==='far'&&matching&&i>=state.arenaJoined){
                const waiting=el('article','arena-fighter arena-fighter-waiting',el('div','arena-fighter-art',el('span','arena-arrival-ring')),el('strong','','等待对手加入'),el('small','',fill(`第 {v0} 席 · 正在集结`,{v0:String(i+1)}).text));
                row.append(waiting);continue;
            }
            const icon=el('canvas','arena-name-school');icon.width=32;icon.height=32;icon.setAttribute('role','img');icon.setAttribute('aria-label',fill('{school}系',{school:schools[u.school]||'平衡'}).text);drawSchoolIcon(icon.getContext('2d'),u.school||'balance',16,16,24);
            const p=match.replay[side][i],card=el('article',`arena-fighter ${u.hp<=0?'defeated':''}`,el('div','arena-fighter-art',portrait(p,cb)),el('strong','arena-fighter-name',icon,el('span','',u.name)));
            const elapsed=Date.now()-(state.arenaJoinedAt?.[i]??0);
            if(side==='far'&&elapsed<500){card.classList.add('arena-fighter-arriving');card.style.animationDelay=`-${Math.max(0,elapsed)}ms`;}
            const hp=el('progress','');hp.max=u.maxHp;hp.value=Math.max(0,u.hp);hp.setAttribute('aria-label',fill('{name}生命',{name:u.name}).text);
            card.append(hp,el('small','',`${Math.max(0,u.hp)} / ${u.maxHp}`),el('small','',u.hp<=0?'已退场':fill('能量 {normal} · 强能量 {power}',{normal:u.pips.normal,power:u.pips.power}).text));row.append(card);
        }
        team.append(row);field.append(team);
    }
    body.append(field);
    if(matching){
        const progress=el('progress','arena-arrival-progress');progress.max=match.replay.mode;progress.value=state.arenaJoined;progress.setAttribute('aria-label','对手到场人数');
        const status=el('div','arena-ready',el('h3','',fill('对手已到场 {joined} / {total}',{joined:state.arenaJoined,total:match.replay.mode}).text),progress,el('p','','等待对方全员到齐后，开始15秒准备倒计时。'));
        status.setAttribute('role','status');const wait=button('等待对手到齐',()=>{},'primary');wait.disabled=true;status.append(wait);body.append(status);return;
    }
    const countdown=el('p','',fill('准备好迎战！{seconds} 秒后自动进入战斗法阵。',{seconds:state.arenaReadySeconds??15}).text);countdown.dataset.arenaReady='';
    body.append(el('div','arena-ready',el('h3','','匹配成功'),countdown,button('我准备好了',cb.arenaReady,'primary')));
}
