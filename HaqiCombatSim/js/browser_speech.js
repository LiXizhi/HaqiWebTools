import {acquireAudioActivity} from './audio_activity.js';
let release=null;
export function cancelBrowserSpeech(){
    globalThis.speechSynthesis?.cancel();release?.();release=null;
}
export function speakBrowserText(text,lang){
    if(!globalThis.speechSynthesis||!globalThis.SpeechSynthesisUtterance)return false;
    cancelBrowserSpeech();
    const utterance=new SpeechSynthesisUtterance(text),done=acquireAudioActivity();release=done;
    const finish=()=>{done();if(release===done)release=null;};
    utterance.lang=lang;utterance.rate=.9;utterance.onend=finish;utterance.onerror=finish;
    try{globalThis.speechSynthesis.speak(utterance);return true;}catch{finish();return false;}
}
globalThis.document?.addEventListener?.('visibilitychange',()=>{if(document.hidden)cancelBrowserSpeech();});
globalThis.addEventListener?.('pagehide',cancelBrowserSpeech);
