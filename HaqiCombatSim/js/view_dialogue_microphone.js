import {tr} from './locale_runtime.js';
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

export function createDialogueMicrophone(button,actions){
    const node=button('录音',()=>{},'camp-chat-mic');
    node.setAttribute('aria-label',tr('按住对话，松开发送；点击录制，再点结束；滑出取消'));
    const reset=bindChatMicrophone(node,actions);
    return {node,reset,update({phase,disabled=false}){
        node.disabled=disabled;node.classList.toggle('is-recording',phase==='recording');
        node.textContent=tr(phase==='recording'?'结束':phase==='connecting'?'连接中':'录音');
    }};
}
