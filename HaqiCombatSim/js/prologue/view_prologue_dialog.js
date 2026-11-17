// view_prologue_dialog.js — cinematic bilingual dialogue box for the prologue.
// Text is already localized by the script (native line + second-language line). It deliberately does not
// pass through tr(): the second line must stay in the learner's target language.

const SCHOOL_COLORS={fire:'#ff8a4c',ice:'#7fd3ff',storm:'#c79bff',life:'#7fe08a',death:'#b57cff'};

export function createPrologueDialog(root){
    const doc=root.ownerDocument;
    const make=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const box=make('section','pl-dialog'),avatarSlot=make('div','pl-avatar'),body=make('div','pl-dialog-body'),plate=make('div','pl-speaker'),primary=make('p','pl-primary'),secondary=make('p','pl-secondary'),hint=make('div','pl-next');
    const ring=doc.createElementNS('http://www.w3.org/2000/svg','svg');ring.setAttribute('viewBox','0 0 36 36');ring.classList.add('pl-ring');ring.setAttribute('aria-hidden','true');
    ring.innerHTML='<circle cx="18" cy="18" r="15" class="track"/><circle cx="18" cy="18" r="15" class="bar" pathLength="100"/>';
    const autoButton=make('button','pl-auto-play','自动播放');autoButton.type='button';
    hint.append(ring,autoButton);
    body.append(primary,secondary);
    box.setAttribute('aria-live','polite');box.hidden=true;
    box.append(plate,avatarSlot,body,hint);root.append(box);
    let typing=null,full='',onAutoPlay=null,autoPlay=false,language='zh-CN';
    function setAutoPlay(enabled){
        autoPlay=!!enabled;
        autoButton.textContent=language==='en'?'Auto play':'自动播放';
        autoButton.setAttribute('aria-pressed',String(autoPlay));
        autoButton.title=language==='en'?(autoPlay?'Turn off auto play':'Turn on auto play'):(autoPlay?'关闭自动播放':'开启自动播放');
        autoButton.setAttribute('aria-label',autoButton.title);
        box.title=language==='en'?'Click anywhere or press Space to continue':'点击任意位置或按空格继续';
        if(!autoPlay)setProgress(0);
    }
    autoButton.addEventListener('click',event=>{event.stopPropagation();onAutoPlay?.();});
    setAutoPlay(false);

    function stopTyping(){if(typing){clearInterval(typing);typing=null;}primary.textContent=full;}
    function show({speaker,school,avatar=null,primary:text,secondary:sub,nativeLang,targetLang,reducedMotion=false,promptMode=false}){
        box.hidden=false;box.classList.remove('leaving');
        box.classList.toggle('is-prompt',!!promptMode);
        const accent=SCHOOL_COLORS[school]||'#f2d27a';
        box.style.setProperty('--speaker',accent);
        plate.textContent=speaker||'';plate.hidden=!speaker;
        if(avatar){avatarSlot.replaceChildren(avatar);avatarSlot.hidden=false;box.classList.add('has-avatar');}
        else{avatarSlot.replaceChildren();avatarSlot.hidden=true;box.classList.remove('has-avatar');}
        autoButton.hidden=!!promptMode;
        language=nativeLang;setAutoPlay(autoPlay);
        full=text||'';primary.lang=nativeLang;secondary.lang=targetLang;secondary.textContent=sub||'';secondary.hidden=!sub;
        if(typing)clearInterval(typing);typing=null;
        if(reducedMotion||promptMode){primary.textContent=full;return;}
        const chars=[...full];let i=0;primary.textContent='';
        typing=setInterval(()=>{i+=nativeLang==='en'?3:2;primary.textContent=chars.slice(0,i).join('');if(i>=chars.length)stopTyping();},20);
    }
    function setProgress(value){ring.querySelector('.bar').style.strokeDashoffset=String(100-Math.max(0,Math.min(1,value))*100);hint.classList.toggle('counting',value>0);}
    function hide(){stopTyping();box.classList.add('leaving');box.hidden=true;}
    return {show,hide,setProgress,setAutoPlay,stopTyping,get typing(){return !!typing;},set onAutoPlay(fn){onAutoPlay=fn;},dispose(){stopTyping();box.remove();},element:box};
}
