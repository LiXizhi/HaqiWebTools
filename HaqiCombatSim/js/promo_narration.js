import {loadKeepwork} from './adventure_cloud.js';
async function loadSpeech(){const sdk=await loadKeepwork();await sdk.loadAIChat();return sdk;}
// Same SDK voice catalogue and SpeechRTC synthesis path as AIChat read-aloud.
export function createPromoNarration({load=loadSpeech,makeAudio=url=>new Audio(url),revoke=url=>URL.revokeObjectURL(url),onError=()=>{},onState=()=>{}}={}){
    let sdk,loading,current='',generation=0,audio=null,pending=false,starting=false,active=null,warm=null,playReady;
    const release=value=>{if(value?.startsWith('blob:'))revoke(value);};
    const clipKey=({text,lang,voiceURI=''})=>JSON.stringify([text,lang,voiceURI]);
    function dispose(clip){if(!clip||clip.disposed)return;clip.disposed=true;void Promise.resolve(clip.session?.interrupt()).catch(()=>{});release(clip.url);clip.url=null;}
    function clearPrefetch(){dispose(warm);warm=null;}
    function stop(){generation++;pending=false;starting=false;current='';if(audio){audio.pause();audio.removeAttribute('src');audio.load();audio=null;}dispose(active);active=null;onState('');}
    async function ready(){return loading??=(async()=>{sdk=await load();if(!sdk.speech?.getSupportedVoices||!sdk.speechRTC?.createSession)throw Error('Keepwork语音服务不可用');return sdk;})().catch(error=>{loading=null;throw error;});}
    function createClip(options){
        const clip={key:clipKey(options),disposed:false,url:null,session:null};
        clip.promise=(async()=>{let timer;try{
            await ready();if(clip.disposed)return;
            const voices=sdk.speech.getSupportedVoices(),voice=voices.find(v=>v.id===options.voiceURI)||voices.find(v=>v.language===options.lang)||voices[0];
            if(!voice)throw Error('没有可用音色');
            clip.session=sdk.speechRTC.createSession({voiceType:voice.id,audioFormat:'mp3',autoPlay:false,enableSubtitle:false});
            const request=clip.session.synthesize(options.text,{close:true,closeConnection:false});
            request.then(result=>{if(clip.disposed)release(result?.audioUrl);},()=>{});
            const result=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('语音合成超时')),30000);})]);
            if(clip.disposed)return;
            if(!result?.audioUrl)throw Error('语音服务未返回音频');
            clip.url=result.audioUrl;return clip.url;
        }catch(error){dispose(clip);throw error;}finally{clearTimeout(timer);}})();
        // Prefetch is optional; a failed clip is retried when it becomes current.
        void clip.promise.catch(()=>{});return clip;
    }
    function prefetch(options){if(!options?.text)return clearPrefetch();const key=clipKey(options);if(warm?.key===key)return;clearPrefetch();warm=createClip(options);}
    function speak({text,key,lang,voiceURI='',rate=1,enabled=true,playing=false}){
        if(!enabled||!playing||!text){if(current)stop();return Promise.resolve();}
        const identity=JSON.stringify([key,text,lang,voiceURI,rate]);if(current===identity)return playReady;
        stop();current=identity;pending=true;starting=true;onState('正在合成字幕…');const ticket=generation,options={text,lang,voiceURI};
        active=warm?.key===clipKey(options)&&!warm.disposed?warm:createClip(options);if(active===warm)warm=null;const clip=active;
        playReady=(async()=>{try{
            const url=await clip.promise;if(ticket!==generation)return;
            audio=makeAudio(url);audio.playbackRate=Math.min(2,Math.max(.5,rate));
            audio.onended=()=>{if(ticket===generation){pending=false;starting=false;onState('');}};
            audio.onerror=()=>{if(ticket===generation){stop();current=identity;onError('语音播放失败');}};
            await audio.play();if(ticket===generation&&pending){starting=false;onState('正在朗读字幕');}
        }catch(error){if(ticket===generation){stop();current=identity;onError(error.message);}}})();
        return playReady;
    }
    return {ready,speak,stop,prefetch,clearPrefetch,get pending(){return pending;},get starting(){return starting;},voices:()=>sdk?.speech?.getSupportedVoices?.().filter(v=>v.id&&v.name)||[]};
}
