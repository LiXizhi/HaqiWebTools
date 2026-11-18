// Translation, writing completion, and finale completion are separate capabilities.
export function connectHanziAnimation(frame,{entryId,sessionId,locale='zh-CN',subtitleLocale=locale,translate=x=>x,onWritten=()=>{},onComplete=()=>{},eventTarget=globalThis.window||globalThis}){
    const origin=new URL(frame.src,globalThis.location?.href).origin;
    let disposed=false,ready=false,written=false,completed=false;
    const send=value=>frame.contentWindow?.postMessage({channel:'haqi-hanzi',version:1,entryId,sessionId,...value},origin);
    const initialize=()=>send({type:'init',locale,...(subtitleLocale&&subtitleLocale!==locale?{subtitleLocale}:{})});
    function receive(event){
        const m=event.data;
        if(disposed||event.source!==frame.contentWindow||event.origin!==origin||m?.channel!=='haqi-hanzi'||m.version!==1)return;
        if(m.type==='ready'){ready=true;initialize();return;}
        if(m.sessionId!==sessionId||m.entryId!==entryId)return;
        if(m.type==='translate'&&typeof m.requestId==='string'&&Array.isArray(m.texts)&&m.texts.length<=100&&m.texts.every(x=>typeof x==='string'&&x.length<=2000)){
            const subTarget=subtitleLocale||locale;
            const translations={};for(const text of m.texts){const translated=translate(text,subTarget);if(translated&&translated!==text)translations[text]=translated;}
            const payload={type:'translations',requestId:m.requestId,locale,translations};
            if(subTarget!==locale){
                const uiTranslations={};for(const text of m.texts){const translated=translate(text,locale);if(translated&&translated!==text)uiTranslations[text]=translated;}
                payload.subtitleLocale=subTarget;payload.uiTranslations=uiTranslations;
            }
            send(payload);
        }else if(m.type==='written'&&ready&&!written){written=true;onWritten();}
        else if(m.type==='completed'&&ready&&!completed){completed=true;onComplete();}
    }
    eventTarget.addEventListener('message',receive);frame.addEventListener('load',initialize);
    return ()=>{disposed=true;eventTarget.removeEventListener('message',receive);frame.removeEventListener('load',initialize);};
}
