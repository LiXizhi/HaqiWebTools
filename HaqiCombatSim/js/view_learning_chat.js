import {playerGloss} from './character_relationship_core.js';
import {createDialogueMicrophone} from './view_dialogue_microphone.js';
export {bindChatMicrophone} from './view_dialogue_microphone.js';
import {tr,fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';

const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=['camp-chat-original','camp-chat-translation'].includes(cls)?text:tr(text);return n;};
const button=(text,run,cls='secondary')=>{const n=el('button',cls,text);n.type='button';n.onclick=run;return n;};

export function createLearningChatView(cb){
    const root=el('div','overlay learning-overlay camp-chat-overlay');root.hidden=true;
    const room=el('section','camp-chat');room.setAttribute('role','dialog');room.setAttribute('aria-modal','true');room.setAttribute('aria-label','营地双语对话');
    const aside=el('aside','camp-chat-character'),portrait=el('img','camp-chat-portrait'),name=el('h2'),role=el('p','camp-chat-role'),context=el('p','camp-chat-context');
    const portraitFrame=el('div','camp-chat-portrait-frame');
    portrait.alt='';portrait.onerror=()=>{portrait.hidden=true;};portraitFrame.append(portrait);aside.append(name,role,portraitFrame,context);
    const panel=el('div','camp-chat-panel'),header=el('header','camp-chat-header'),title=el('h3'),progress=el('span','camp-chat-progress');
    const chinese=button('隐藏释义',()=>cb.chinese(),'secondary small'),change=button('换个故事',()=>cb.next(),'secondary small');
    const settings=button('设置',()=>cb.settings(),'secondary small'),close=createCloseButton(cb.close,'关闭营地对话');
    const freeTalk=button('自由交谈',()=>cb.free?.(),'secondary small');
    const toolbar=el('div','camp-chat-toolbar'),headerActions=el('div','camp-chat-toolbar-actions');
    const headerMenu=el('div','camp-chat-toolbar-menu');headerMenu.hidden=true;headerMenu.setAttribute('role','menu');headerMenu.setAttribute('aria-label',tr('更多聊天操作'));
    const headerMore=button('...',()=>setHeaderMenu(headerMenu.hidden),'secondary small camp-chat-toolbar-more');
    headerMore.hidden=true;headerMore.title=tr('更多聊天操作');headerMore.setAttribute('aria-label',tr('更多聊天操作'));headerMore.setAttribute('aria-expanded','false');headerMore.setAttribute('aria-haspopup','menu');
    headerActions.append(chinese,change,freeTalk,settings,headerMore,headerMenu);toolbar.append(progress,headerActions);header.append(title,toolbar);room.append(close);
    function setHeaderMenu(open,focus=false){headerMenu.hidden=!open;headerMore.setAttribute('aria-expanded',String(open));if(focus)headerMore.focus();}
    // Header actions stay on one row. Labels that do not fit move into the ... menu.
    function fitHeaderActions(){
        if(!toolbar.isConnected||!toolbar.clientWidth)return;
        const items=[chinese,change,freeTalk,settings].filter(n=>!n.hidden);
        const gap=8,floor=48;
        headerActions.replaceChildren(...items,headerMore,headerMenu);
        headerMenu.replaceChildren();headerMore.hidden=true;
        const width=n=>n.getBoundingClientRect().width;
        const natural=items.reduce((sum,n,i)=>sum+width(n)+(i?gap:0),0);
        const available=toolbar.clientWidth-floor-gap;
        let fit=items.length;
        if(natural>available+0.5){
            headerMore.hidden=false;
            const reserve=width(headerMore)+gap;
            let used=0;fit=0;
            for(const n of items){
                const next=used+(fit?gap:0)+width(n);
                if(next+reserve>available+0.5)break;
                used=next;fit++;
            }
        }
        headerActions.replaceChildren(...items.slice(0,fit),headerMore,headerMenu);
        headerMenu.replaceChildren(...items.slice(fit));
        headerMore.hidden=fit===items.length;
        if(headerMore.hidden)setHeaderMenu(false);
    }
    if(typeof ResizeObserver==='function'&&typeof toolbar.getBoundingClientRect==='function')new ResizeObserver(()=>fitHeaderActions()).observe(toolbar);
    headerMenu.addEventListener('click',e=>{if(e.target.closest('button'))setHeaderMenu(false,true);},true);
    const celebration=el('div','camp-chat-celebration');celebration.hidden=true;
    celebration.setAttribute('role','status');celebration.setAttribute('aria-live','polite');
    const completedActions=el('div','camp-chat-completed-actions');completedActions.hidden=true;
    const loginNotice=el('section','camp-chat-login');loginNotice.hidden=true;loginNotice.setAttribute('role','status');
    const loginTitle=el('h3','','登录 KeepWork，开启 AI 对话'),loginText=el('p','','离线角色暂时无法使用大模型。登录后会自动将当前本地角色转为云端角色，保留冒险进度。'),loginButton=button('登录并转为云端角色',()=>cb.login?.());
    loginNotice.append(loginTitle,loginText,loginButton);
    const log=el('div','camp-chat-log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');
    const hint=el('div','camp-chat-hint');hint.hidden=true;
    const footer=el('footer','camp-chat-footer'),status=el('p','camp-chat-status');status.setAttribute('role','status');
    const form=el('form','camp-chat-input');form.hidden=true;
    const input=el('input');input.placeholder=tr('输入你的回答，答对即可继续');input.maxLength=500;input.setAttribute('aria-label',tr('文字回答'));
    const send=button('发送',()=>{if(needsRecovery(state)){cb.retry?.();return;}const text=input.value.trim();if(text){if(state?.mode!=='free')input.value='';cb.help(text);}});form.onsubmit=e=>{e.preventDefault();send.click();};const inputBox=el('div','camp-chat-input-box');inputBox.append(input);form.append(inputBox,send);input.oninput=()=>cb.draft?.(input.value);
    function needsRecovery(s){return s?.mode==='free'&&s.retryable&&(!s.ready||s.giftReply||!s.draft?.trim());}
    const actions=el('div','camp-chat-actions');
    const typing=button('输入',()=>{form.hidden=!form.hidden;if(!form.hidden)input.focus();},'secondary');
    const microphone=createDialogueMicrophone(button,{isRecording:()=>!!state?.recording,start:cb.start,finish:cb.finish,cancel:cb.cancel}),mic=microphone.node;
    const hints=button('提示',()=>cb.hint(),'secondary');
    const details=button('关系详情',()=>cb.details?.()),gift=button('送礼物',()=>cb.gift?.()),upgrade=button('升级会员',()=>cb.upgrade?.());
    const more=button('+',()=>setMore(menu.hidden),'camp-chat-more');more.title=tr('更多聊天操作');more.setAttribute('aria-label',tr('更多聊天操作'));more.setAttribute('aria-expanded','false');
    const menu=el('div','camp-chat-more-menu');menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label',tr('更多聊天操作'));menu.append(details,gift,upgrade);inputBox.append(more,menu);
    function setMore(open,focus=false){menu.hidden=!open;more.setAttribute('aria-expanded',String(open));if(focus)more.focus();}
    menu.addEventListener('click',e=>{if(e.target.closest('button'))setMore(false,true);},true);
    root.addEventListener('pointerdown',e=>{
        if(!menu.hidden&&!menu.contains(e.target)&&!more.contains(e.target))setMore(false);
        if(!headerMenu.hidden&&!headerMenu.contains(e.target)&&!headerMore.contains(e.target))setHeaderMenu(false);
    });
    root.addEventListener('focusin',e=>{
        if(!menu.hidden&&!menu.contains(e.target)&&!more.contains(e.target))setMore(false);
        if(!headerMenu.hidden&&!headerMenu.contains(e.target)&&!headerMore.contains(e.target))setHeaderMenu(false);
    });
    actions.append(typing,mic,hints);const caption=el('p','camp-chat-caption','按住对话，松开发送 · 点击录制，再点结束');
    footer.append(hint,form,actions,caption,status,completedActions);panel.append(header,loginNotice,log,footer);room.append(aside,panel,celebration);root.append(room);document.body.append(root);
    let portraitNode=null,state=null,trigger=null,key='',fingerprint='',celebrated=null,celebrationTimer=null;
    function hideCelebration(){clearTimeout(celebrationTimer);celebration.hidden=true;}
    const clearPress=microphone.reset;
    root.onkeydown=e=>{
        e.stopPropagation();if(e.key==='Escape'){e.preventDefault();if(!headerMenu.hidden){setHeaderMenu(false,true);return;}if(!menu.hidden){setMore(false,true);return;}cb.close();}
        if(e.key==='Tab'){
            const nodes=[...room.querySelectorAll('button:not(:disabled),input')].filter(n=>n.getClientRects().length);
            if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1)?.focus();}
            else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0]?.focus();}
        }
    };
    function message(row,s){
        const item=el('article',`camp-chat-message ${row.role==='user'?'is-player':'is-npc'}`);
        const avatar=el('span','camp-chat-avatar',row.role==='user'?'我':s.profile.name.slice(0,1));
        const content=el('div','camp-chat-bubble'),text=typeof row.text==='string'?row.text:row.text?.[s.locale]||'';
        content.append(el('p','camp-chat-original',text));
        const raw=typeof row.text==='object'?row.text[s.locale==='en'?'zh-CN':'en']:row.translation;
        const translation=s.mode==='free'?playerGloss(text,raw,s.native||'zh-CN'):(raw&&String(raw).replace(/\s+/g,'')===String(text).replace(/\s+/g,'')?'':raw);
        if(translation&&s.showChinese)content.append(el('p','camp-chat-translation',translation));
        if(row.role!=='user'&&text){const listen=button('再听一次',()=>cb.speak(text),'camp-chat-replay');listen.disabled=s.busy||s.recording;content.append(listen);}
        if(row===s.messages[0]&&row.role!=='user'&&s.reward?.amount!==undefined)content.append(el('small','camp-chat-reward-preview',fill('对话奖励：{amount} {currency}',{amount:s.reward.amount,currency:tr(s.reward.currency===100?'奇豆':'仙豆')}).text));
        if(row.feedback)content.append(el('small','camp-chat-answer-feedback',row.feedback));
        if(row.label&&!row.feedback)content.append(el('small','camp-chat-message-label',row.label));
        item.append(avatar,content);return item;
    }
    return {
        root,
        close(){setMore(false);setHeaderMenu(false);hideCelebration();celebrated=null;clearPress();root.hidden=true;portraitNode?.remove();portraitNode=null;state=null;key='';fingerprint='';form.hidden=true;if(trigger?.isConnected)trigger.focus();},
        render(s){
            state=s;const fresh=root.hidden;if(fresh){trigger=document.activeElement;root.hidden=false;}
            if(key!==s.story.id){setMore(false);key=s.story.id;name.textContent=tr(s.profile.name);role.textContent=tr(s.profile.role);context.textContent=tr(s.story.context);title.textContent=tr(s.story.title);
                portraitNode?.remove();portraitNode=s.portraitNode||null;if(portraitNode){portraitNode.classList.add('camp-chat-character-art');portraitFrame.append(portraitNode);}portraitFrame.hidden=!s.portrait&&!portraitNode;portrait.hidden=!s.portrait||!!portraitNode;name.title=name.textContent;role.title=role.textContent;if(s.portrait)portrait.src=s.portrait;form.hidden=true;
            }
            const free=s.mode==='free';more.hidden=!free;inputBox.classList.toggle('has-more',free);if(!free)setMore(false);
            room.setAttribute('aria-label',free?'跨文化自由对话':'营地双语对话');
            change.hidden=free;freeTalk.hidden=free||!cb.free;freeTalk.disabled=s.busy||s.recording;details.hidden=!free;gift.hidden=!free||!s.canGift;upgrade.hidden=!free||s.vip;
            details.disabled=gift.disabled=s.busy||s.recording||!s.ready;
            if(free){form.hidden=false;input.placeholder=tr('用彼此理解的语言交流');input.maxLength=2000;if(document.activeElement!==input||s.draft==='')input.value=s.draft||'';}
            progress.textContent=free?(s.loginRequired?'登录后可使用 AI 对话':s.vip?'会员自由对话':s.remaining==null?'正在核验额度':`今日剩余 ${s.remaining}/2 次`):s.done?tr('交流完成'):fill('第 {turn} / {total} 轮',{turn:s.index+1,total:s.story.turns.length}).text;
            chinese.textContent=tr(s.showChinese?'隐藏释义':'显示释义');chinese.setAttribute('aria-pressed',String(!s.showChinese));
            const print=JSON.stringify([s.messages,s.showChinese,s.locale,s.reward?.amount,s.reward?.currency]);
            if(print!==fingerprint){const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;fingerprint=print;log.replaceChildren(...s.messages.map(row=>message(row,s)));if(bottom||fresh)log.scrollTop=log.scrollHeight;}
            for(const replay of log.querySelectorAll('button'))replay.disabled=s.busy||s.recording;
            hint.hidden=!s.hintLevel||s.done;
            hints.textContent=tr(s.hintLevel?'收起提示':'显示提示');hints.setAttribute('aria-expanded',String(!hint.hidden));
            if(!hint.hidden&&free){hint.replaceChildren(el('p','',s.hintText||'正在生成提示…'));}
            if(!hint.hidden&&!free){const turn=s.story.turns[s.index];hint.replaceChildren(el('strong','','回答提示'),el('p','',turn.hint));
                if(s.hintLevel>=2)hint.append(el('p','camp-chat-original',s.locale==='en'?turn.pattern.replace(/\{\w+\}/g,'…'):turn.answer['zh-CN']));
                if(s.hintLevel>=3){hint.append(el('p','camp-chat-original',turn.answer[s.locale]));if(s.showChinese)hint.append(el('p','camp-chat-translation',turn.answer[s.locale==='en'?'zh-CN':'en']));const sample=button('听示范',()=>cb.speak(turn.answer[s.locale]),'secondary small');sample.disabled=s.busy||s.recording;hint.append(sample);}
            }
            mic.disabled=(free&&(!s.ready||(!s.vip&&s.remaining===0)))||s.done||(s.busy&&!s.recording&&s.phase!=='connecting');microphone.update({phase:s.recording?'recording':s.phase,disabled:mic.disabled});
            change.disabled=s.busy||s.recording;settings.disabled=s.busy||s.recording;hints.disabled=s.done;send.disabled=s.busy||s.recording||s.done||(free&&(!s.ready||(!s.vip&&s.remaining===0)&&s.draft?.trim()!=='/compact'));hints.disabled=s.busy||s.recording||!s.ready&&free;
            send.textContent=tr(needsRecovery(s)?(!s.ready?'重新连接':'获取回应'):'发送');
            if(needsRecovery(s)||free&&s.pending)send.disabled=s.busy||s.recording||s.done;
            loginNotice.hidden=!(free&&s.loginRequired);loginButton.disabled=s.busy;
            if(s.loginRequired){form.hidden=true;log.hidden=true;}else log.hidden=false;
            const r=s.reward;
            completedActions.hidden=!s.done;
            actions.hidden=s.done||!!s.loginRequired;caption.hidden=s.done||!!s.loginRequired;form.hidden=s.done||form.hidden;
            completedActions.replaceChildren();
            if(s.done){
                if(r?.action&&s.received>0)completedActions.append(button('去使用',cb.useReward,'secondary small'));
                if((s.story.mode||'basic')==='basic')completedActions.append(button('试试独立表达挑战',cb.challenge,'secondary small'));
                for(const action of completedActions.querySelectorAll('button'))action.disabled=s.busy||s.recording;
                const completionKey=s.attemptId||s.story;
                if(celebrated!==completionKey){
                    hideCelebration();celebrated=completionKey;
                    celebration.replaceChildren(el('strong','','表现真棒，给你点赞！'),el('p','camp-chat-celebration-amount',s.received>0?fill('+{amount} {currency}',{amount:s.received,currency:tr(r?.currency===100?'奇豆':'仙豆')}).text:tr('练习完成，继续加油！')));
                    celebration.hidden=false;celebrationTimer=setTimeout(hideCelebration,2800);
                }
            }else{hideCelebration();celebrated=null;}
            loginTitle.textContent=tr('登录 KeepWork，开启 AI 对话');loginText.textContent=tr('离线角色暂时无法使用大模型。登录后会自动将当前本地角色转为云端角色，保留冒险进度。');loginButton.textContent=tr('登录并转为云端角色');
            status.textContent=s.loginRequired?'':tr(s.status);caption.textContent=tr(s.recording?'正在录音 · 松开发送，滑出取消':'按住对话，松开发送 · 点击录制，再点结束');
            const moreLabel=tr('更多聊天操作');headerMore.title=moreLabel;headerMore.setAttribute('aria-label',moreLabel);
            fitHeaderActions();
            if(fresh)close.focus({preventScroll:true});
        },
    };
}
