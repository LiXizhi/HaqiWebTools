import {tr,fill} from './locale_runtime.js';
import {createCloseButton} from './view_adventure_controls.js';

const el=(tag,cls='',text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=['camp-chat-original','camp-chat-translation'].includes(cls)?text:tr(text);return n;};
const button=(text,run,cls='secondary')=>{const n=el('button',cls,text);n.type='button';n.onclick=run;return n;};

// Keep the microphone node mounted while permission/ASR requests are pending.
// HelloLearner uses the same 350ms boundary between click and hold.
export function bindChatMicrophone(node,actions){
    let press=null;
    const down=e=>{
        if(e.button!==undefined&&e.button!==0||press||node.disabled)return;
        e.preventDefault();node.focus?.({preventScroll:true});node.setPointerCapture?.(e.pointerId);
        press={id:e.pointerId,at:e.timeStamp,stopping:actions.isRecording()};
        if(press.stopping)void actions.finish();else void actions.start();
    };
    const up=e=>{
        if(!press||press.id!==e.pointerId)return;
        const old=press;press=null;
        const r=node.getBoundingClientRect();
        const outside=e.clientX!==undefined&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);
        if(!old.stopping){
            if(e.type!=='pointerup'||outside)void actions.cancel();
            else if(e.timeStamp-old.at>=350)void actions.finish();
        }
    };
    node.addEventListener('pointerdown',down);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',up);node.addEventListener('lostpointercapture',up);
    node.addEventListener('click',e=>{if(e.detail===0&&!node.disabled)void(actions.isRecording()?actions.finish():actions.start());});
    node.addEventListener('contextmenu',e=>e.preventDefault());
    return ()=>{press=null;};
}

export function createLearningChatView(cb){
    const root=el('div','overlay learning-overlay camp-chat-overlay');root.hidden=true;
    const room=el('section','camp-chat');room.setAttribute('role','dialog');room.setAttribute('aria-modal','true');room.setAttribute('aria-label','营地双语对话');
    const aside=el('aside','camp-chat-character'),portrait=el('img','camp-chat-portrait'),name=el('h2'),role=el('p','camp-chat-role'),context=el('p','camp-chat-context');
    portrait.alt='';portrait.onerror=()=>{portrait.hidden=true;};aside.append(name,role,portrait,context);
    const panel=el('div','camp-chat-panel'),header=el('header','camp-chat-header'),title=el('h3'),progress=el('span','camp-chat-progress');
    const chinese=button('隐藏释义',()=>cb.chinese(),'secondary small'),change=button('换个故事',()=>cb.next(),'secondary small');
    const settings=button('设置',()=>cb.settings(),'secondary small'),close=createCloseButton(cb.close,'关闭营地对话');
    header.append(title,progress,chinese,change,settings);room.append(close);
    const reward=el('section','camp-chat-reward');
    const log=el('div','camp-chat-log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');
    const hint=el('div','camp-chat-hint');hint.hidden=true;
    const footer=el('footer','camp-chat-footer'),status=el('p','camp-chat-status');status.setAttribute('role','status');
    const form=el('form','camp-chat-input');form.hidden=true;
    const input=el('input');input.placeholder='输入问题或请求帮助（不能代替口语通关）';input.maxLength=500;input.setAttribute('aria-label','文字求助');
    const send=button('发送',()=>{const text=input.value.trim();if(text){input.value='';cb.help(text);}});form.onsubmit=e=>{e.preventDefault();send.click();};form.append(input,send);
    const actions=el('div','camp-chat-actions');
    const typing=button('输入',()=>{form.hidden=!form.hidden;if(!form.hidden)input.focus();},'secondary');
    const mic=button('录音',()=>{},'camp-chat-mic');mic.setAttribute('aria-label','点击录制，再次点击结束；也可以按住对话');
    const hints=button('提示',()=>cb.hint(),'secondary');
    actions.append(typing,mic,hints);const caption=el('p','camp-chat-caption','按住对话，松开发送 · 点击录制，再点结束');
    footer.append(hint,form,actions,caption,status);panel.append(header,reward,log,footer);room.append(aside,panel);root.append(room);document.body.append(root);
    let state=null,trigger=null,key='',fingerprint='';
    const clearPress=bindChatMicrophone(mic,{isRecording:()=>!!state?.recording,start:cb.start,finish:cb.finish,cancel:cb.cancel});
    root.onkeydown=e=>{
        e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cb.close();}
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
        const translation=typeof row.text==='object'?row.text[s.locale==='en'?'zh-CN':'en']:row.translation;
        if(translation&&s.showChinese)content.append(el('p','camp-chat-translation',translation));
        if(row.role!=='user'&&text){const listen=button('再听一次',()=>cb.speak(text),'camp-chat-replay');listen.disabled=s.busy||s.recording;content.append(listen);}
        if(row.label)content.append(el('small','camp-chat-message-label',row.label));
        item.append(avatar,content);return item;
    }
    return {
        close(){clearPress();root.hidden=true;state=null;key='';fingerprint='';form.hidden=true;if(trigger?.isConnected)trigger.focus();},
        render(s){
            state=s;const fresh=root.hidden;if(fresh){trigger=document.activeElement;root.hidden=false;}
            if(key!==s.story.id){key=s.story.id;name.textContent=tr(s.profile.name);role.textContent=tr(s.profile.role);context.textContent=tr(s.story.context);title.textContent=tr(s.story.title);
                portrait.hidden=!s.portrait;if(s.portrait)portrait.src=s.portrait;form.hidden=true;
            }
            progress.textContent=s.done?tr('交流完成'):fill('第 {turn} / {total} 轮',{turn:s.index+1,total:s.story.turns.length}).text;
            chinese.textContent=tr(s.showChinese?'隐藏释义':'显示释义');chinese.setAttribute('aria-pressed',String(!s.showChinese));
            const print=JSON.stringify([s.messages,s.showChinese,s.locale]);
            if(print!==fingerprint){const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;fingerprint=print;log.replaceChildren(...s.messages.map(row=>message(row,s)));if(bottom||fresh)log.scrollTop=log.scrollHeight;}
            for(const replay of log.querySelectorAll('button'))replay.disabled=s.busy||s.recording;
            hint.hidden=!s.hintLevel||s.done;
            hints.textContent=tr(s.hintLevel?'收起提示':'显示提示');hints.setAttribute('aria-expanded',String(!hint.hidden));
            if(!hint.hidden){const turn=s.story.turns[s.index];hint.replaceChildren(el('strong','','回答提示'),el('p','',turn.hint));
                if(s.hintLevel>=2)hint.append(el('p','camp-chat-original',s.locale==='en'?turn.pattern.replace(/\{\w+\}/g,'…'):turn.answer['zh-CN']));
                if(s.hintLevel>=3){hint.append(el('p','camp-chat-original',turn.answer[s.locale]));if(s.showChinese)hint.append(el('p','camp-chat-translation',turn.answer[s.locale==='en'?'zh-CN':'en']));const sample=button('听示范',()=>cb.speak(turn.answer[s.locale]),'secondary small');sample.disabled=s.busy||s.recording;hint.append(sample);}
            }
            mic.disabled=s.done||(s.busy&&!s.recording&&s.phase!=='connecting');mic.classList.toggle('is-recording',!!s.recording);mic.textContent=tr(s.recording?'结束':s.phase==='connecting'?'连接中':'录音');
            change.disabled=s.busy||s.recording;settings.disabled=s.busy||s.recording;hints.disabled=s.done;send.disabled=s.busy||s.recording||s.done;
            const r=s.reward;
            if(r){
                const currency=r.currency===100?'奇豆':'仙豆';
                reward.replaceChildren(el('strong','',fill('{title} · 三轮交流',{title:s.story.title}).text),el('p','',s.done?fill('本次到账 {amount} {currency} · 当前余额 {balance}',{amount:s.received||0,currency,balance:r.balance}).text:fill('本次可得 {amount} {currency}',{amount:r.amount,currency}).text+(r.reason?' · '+tr(r.reason):'')),el('p','',r.useKey?fill(r.useKey,r.useVars).text:r.use));
                reward.append(el('p','',fill('同组今日剩余 {count} 次 · 今日共享余量 {amount} {currency}',{count:r.remaining,amount:r.dailyRemaining,currency}).text));
                if(s.memento)reward.append(el('p','',fill('首次交流纪念 · {kind} · 已交流 {count} 次',{kind:s.memento.independent?'曾独立表达':'参考提示完成',count:s.memento.completed}).text));
                if(s.done&&r.action)reward.append(button('去使用',cb.useReward,'secondary small'));
                if(s.done&&(s.story.mode||'basic')==='basic')reward.append(button('试试独立表达挑战',cb.challenge,'secondary small'));
            }
            status.textContent=tr(s.status);caption.textContent=tr(s.recording?'正在录音 · 松开发送，滑出取消':'按住对话，松开发送 · 点击录制，再点结束');
            if(fresh)close.focus({preventScroll:true});
        },
    };
}
