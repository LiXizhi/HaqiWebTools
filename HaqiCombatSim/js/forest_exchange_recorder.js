// A recognizer can finish after a dialog, role or target language has changed.
// Tickets invalidate those results; recognition never submits a quest action.
export function createForestExchangeRecorder({voice,valid,onState,onText,onError}){
 let ticket=0,state='idle',controller=null,disposed=false;
 const live=t=>!disposed&&t===ticket&&valid();
 const update=value=>{state=value;onState(value);};
 const stop=()=>{Promise.resolve(voice.cancel()).catch(()=>{});};
 const cancel=()=>{ticket++;controller?.abort();controller=null;stop();if(!disposed)update('idle');};
 const pageHide=()=>cancel();
 globalThis.addEventListener?.('pagehide',pageHide);
 return {
  async start(){
   if(disposed||state!=='idle'||!valid())return;
   const t=++ticket;controller=new AbortController();update('starting');
   try{await voice.start(controller.signal);if(live(t))update('recording');else if(t===ticket)cancel();}
   catch(error){if(t===ticket&&!disposed){const report=valid();cancel();if(report)onError(error);}}
  },
  async finish(){
   if(disposed||state!=='recording')return;
   const t=ticket;update('finishing');
   try{const text=await voice.finish();if(live(t)){controller=null;update('idle');onText(String(text||''));}else if(t===ticket)cancel();}
   catch(error){if(t===ticket&&!disposed){const report=valid();cancel();if(report)onError(error);}}
  },
  cancel,
  dispose(){if(disposed)return;disposed=true;ticket++;controller?.abort();controller=null;stop();globalThis.removeEventListener?.('pagehide',pageHide);},
 };
}
