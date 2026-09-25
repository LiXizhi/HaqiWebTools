// Keepwork IO only. Microphone audio/transcripts are not persisted; completed TTS may be cached.
import {loadKeepwork} from './adventure_cloud.js';
import {cachedLearningAudio,rememberLearningAudio} from './learning_audio_cache.js';

function deadline(promise, ms, signal) {
    return new Promise((resolve,reject)=>{
        const end=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
        const abort=()=>{end();reject(Error('对话已结束'));};
        const timer=setTimeout(()=>{end();reject(Error('语音服务超时，请重试'));},ms);
        if(signal?.aborted){abort();return;}
        signal?.addEventListener('abort',abort,{once:true});
        Promise.resolve(promise).then(v=>{end();resolve(v);},e=>{end();reject(e);});
    });
}
async function sdkReady(signal) {
    const sdk=await deadline(loadKeepwork(),20000,signal);
    await deadline(sdk.loadAIChat(),25000,signal);
    if(signal?.aborted)throw Error('对话已结束');
    return sdk;
}
export function pcm16(samples, sampleRate) {
    const ratio=sampleRate/16000,out=new Int16Array(Math.floor(samples.length/ratio));
    for(let i=0;i<out.length;i++){
        const value=Math.max(-1,Math.min(1,samples[Math.min(samples.length-1,Math.floor(i*ratio))]));
        out[i]=Math.round(value*(value<0?32768:32767));
    }
    return out;
}
export async function loadLearningOptions(signal=new AbortController().signal) {
    const sdk=await sdkReady(signal);
    return {models:sdk.aiGenerators?.getModels?.('chat')||[],voices:sdk.speech?.getSupportedVoices?.()||[]};
}
export function createLearningVoice({load=sdkReady,getSettings=()=>({})}={}) {
    let current=null,speaker=null,playback=null,epoch=0;
    async function dispose(old){
        if(current===old)current=null;
        old?.unlink?.();
        old?.abort.abort();
        old?.media?.getTracks().forEach(t=>t.stop());
        old?.processor?.disconnect();old?.source?.disconnect();
        await old?.context?.close().catch(()=>{});
        await old?.stream?.stop({finish:false}).catch(()=>{});
    }
    async function cancel(){
        epoch++;
        playback?.stop();playback=null;
        const old=current,oldSpeaker=speaker;speaker=null;
        await dispose(old);
        await oldSpeaker?.stop({finish:false}).catch(()=>{});
        globalThis.speechSynthesis?.cancel();
    }
    return {
        cancel,
        async start(signal){
            await cancel();
            const state={abort:new AbortController(),text:'',error:null};current=state;
            const abort=()=>void dispose(state);
            state.unlink=()=>signal.removeEventListener('abort',abort);
            signal.addEventListener('abort',abort,{once:true});
            try{
                if(signal.aborted)throw Error('对话已结束');
                const sdk=await load(state.abort.signal);
                const speech=sdk.speechRTC;
                if(!speech?.createSession)throw Error('当前Keepwork版本尚未提供语音识别');
                const stream=state.stream=speech.createSession({asrSampleRate:16000});
                if(typeof stream.startASR!=='function')throw Error('当前Keepwork版本尚未提供语音识别');
                stream.on('asr',m=>{if(typeof m.text==='string')state.text=m.text;});
                stream.on('asrError',()=>{state.error=Error('没有识别成功，请重新录音');});
                await deadline(stream.startASR(),20000,state.abort.signal);
                const request=navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true},video:false});
                request.then(media=>{if(state.abort.signal.aborted)media.getTracks().forEach(t=>t.stop());}).catch(()=>{});
                state.media=await deadline(request,20000,state.abort.signal);
                state.context=new AudioContext();await deadline(state.context.resume(),10000,state.abort.signal);
                if(state.abort.signal.aborted)throw Error('对话已结束');
                state.source=state.context.createMediaStreamSource(state.media);
                state.processor=state.context.createScriptProcessor(4096,1,1);
                state.processor.onaudioprocess=e=>{
                    if(state.abort.signal.aborted)return;
                    try{stream.sendAudio(pcm16(e.inputBuffer.getChannelData(0),state.context.sampleRate));}catch{state.error=Error('录音连接中断，请重试');}
                };
                state.source.connect(state.processor);state.processor.connect(state.context.destination);
                return true;
            }catch(error){await dispose(state);throw error;}
            finally{if(current!==state)signal.removeEventListener('abort',abort);}
        },
        async finish(){
            const state=current;if(!state)throw Error('请先录音');
            state.media?.getTracks().forEach(t=>t.stop());state.processor?.disconnect();state.source?.disconnect();
            try{
                await deadline(state.stream.finishASR(),32000,state.abort.signal);
                if(state.error)throw state.error;
                if(!state.text.trim())throw Error('没有听清，请重新说一遍');
                return state.text.trim().slice(0,2000);
            }finally{await dispose(state);}
        },
        async speak(text,locale,signal){
            if(current)throw Error('请先结束录音');
            await cancel();
            const turn=epoch;
            const sdk=await load(signal);
            if(turn!==epoch||signal.aborted)throw Error('对话已结束');
            if(!sdk.speechRTC?.createSession)throw Error('当前Keepwork版本尚未提供朗读');
            // HelloLearner/js/speech.js: synthesize MP3 without autoPlay, then
            // await actual playback. Finishing synthesis is not finishing speech.
            sdk.speech?.resumeSharedAudioEngine?.();
            const voiceType=getSettings().voiceType;
            const config={audioFormat:'mp3',autoPlay:false,enableSubtitle:false,speechRate:-8,...(voiceType?{voiceType}:{})};
            const key=JSON.stringify([text,locale,config]);
            let stream=null,audio=null,finishPlayback=null,release=null;
            const request=new AbortController();
            const stop=()=>{request.abort();audio?.pause();finishPlayback?.();void stream?.stop({finish:false}).catch(()=>{});};
            signal.addEventListener('abort',stop,{once:true});
            const active={stop};playback=active;
            try{
                let result;
                if(sdk.speechRTC.synthesizeCached){
                    const pending=sdk.speechRTC.synthesizeCached(text,{...config,signal:request.signal});
                    pending.then(value=>{if(request.signal.aborted)value.release?.();},()=>{});
                    result=await deadline(pending,30000,signal);
                    release=result.release;
                }else{
                    const cached=cachedLearningAudio(key);
                    if(cached){const audioUrl=URL.createObjectURL(cached);result={audioUrl};release=()=>URL.revokeObjectURL(audioUrl);}
                    else{
                        stream=speaker=sdk.speechRTC.createSession(config);
                        result=await deadline(stream.synthesize(text,{close:true,closeConnection:false}),30000,signal);
                        if(result?.audioUrl?.startsWith('blob:'))release=()=>URL.revokeObjectURL(result.audioUrl);
                        if(turn===epoch&&!signal.aborted&&result?.audioUrl){
                            try{const blob=await deadline(fetch(result.audioUrl,{signal:request.signal}).then(r=>r.blob()),3000,signal);if(turn===epoch&&!signal.aborted)rememberLearningAudio(key,blob);}catch{/* Playback still works when copying to cache fails. */}
                        }
                    }
                }
                if(turn!==epoch||signal.aborted)throw Error('对话已结束');
                if(!result?.audioUrl)throw Error('朗读服务没有返回音频，请重试');
                audio=new Audio(result.audioUrl);
                await deadline(new Promise((resolve,reject)=>{
                    finishPlayback=resolve;audio.onended=resolve;
                    audio.onerror=()=>reject(Error('朗读播放失败，请重试'));
                    audio.play().catch(reject);
                }),60000,signal);
            }finally{stop();release?.();signal.removeEventListener('abort',stop);if(speaker===stream)speaker=null;if(playback===active)playback=null;}
        },
        async judge(messages,signal,{maxTokens=800,rawText=false}={}){
            const sdk=await load(signal);
            if(!sdk.token)throw Error('使用AI服务需要先登录Keepwork');
            const abortController=new AbortController(),abort=()=>abortController.abort();
            signal.addEventListener('abort',abort,{once:true});
            try{
                const model=getSettings().model;
                const result=await deadline(sdk.aiChat.chat({messages,...(model?{model}:{}),stream:false,tools:[],enableTools:[],needMqttTools:false,needPersonalTools:false,reasoning:false,maxTokens,abortController}),45000,signal);
                const text=typeof result==='string'?result:result?.choices?.[0]?.message?.content||result?.result;
                if(typeof text!=='string')throw Error('对话服务未返回有效内容');
                return rawText?text:JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
            }finally{abort();signal.removeEventListener('abort',abort);}
        },
    };
}
