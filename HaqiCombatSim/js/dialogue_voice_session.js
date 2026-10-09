// Shared microphone/TTS lifecycle. Views and reward rules remain with each caller.
export function createDialogueVoiceSession(voice){
    let active=null;
    const live=op=>active===op&&!op.signal?.aborted&&op.valid();
    function clear(op){clearTimeout(op?.timer);}
    function dispose(){const op=active;active=null;clear(op);return voice.cancel();}
    async function finish(){
        const op=active;if(!op||!live(op))return;
        if(op.phase==='connecting'){op.release=true;return;}
        if(op.phase!=='recording')return;
        clear(op);op.phase='judging';op.onState('judging');
        try{const text=await voice.finish();if(live(op))await op.onText(text);}
        catch(error){if(live(op))op.onError(error);}
        finally{if(active===op)active=null;}
    }
    async function start(options){
        if(active)return;
        const op=active={...options,phase:'connecting',release:false};op.onState('connecting');
        try{
            if(op.before)await op.before();if(!live(op))return;
            await voice.start(op.signal,{onPartial:text=>{if(live(op)&&['connecting','recording'].includes(op.phase))op.onPartial?.(text);}});if(!live(op))return;
            op.phase='recording';op.onState('recording');op.timer=setTimeout(()=>void finish(),op.maxMs);
            if(op.release)await finish();
        }catch(error){if(live(op)){active=null;op.onError(error);}}
        finally{if(active===op&&!live(op)){clear(op);active=null;}}
    }
    async function cancel(){const op=active;active=null;clear(op);await voice.cancel();if(op&&!active&&!op.signal?.aborted&&op.valid())(op.onCancel||op.onDone)?.();}
    async function speak(options){
        if(active)return;
        const op=active={...options,phase:'speaking'};op.onState('speaking');
        try{await voice.speak(op.text,op.locale,op.signal,op.speaker);}
        catch(error){if(live(op))op.onError(error);}
        finally{if(live(op)){active=null;op.onDone();}else if(active===op)active=null;}
    }
    return {start,finish,cancel,speak,dispose,get recording(){return ['connecting','recording'].includes(active?.phase);}};
}
