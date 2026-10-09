import {setText} from './locale_runtime.js';

// Presentation only. Call after a successful mutation; never grants rewards.
// Each line is a Chinese key string, or [pattern, vars] for fill() templates.
export class GlobalRewardNotice {
    constructor({document:doc=globalThis.document,duration=3000}={}) {
        this.doc=doc;this.duration=duration;this.queue=[];this.timer=null;
        this.root=doc.createElement('div');this.root.className='global-reward-notice';
        this.root.setAttribute('popover','manual');this.root.setAttribute('role','status');
        this.root.setAttribute('aria-live','polite');this.root.setAttribute('aria-atomic','true');
        this.root.hidden=true;doc.body.append(this.root);
        // Re-enter the top layer when another native modal opens above us.
        if(typeof MutationObserver!=='undefined'){
            let modal=null;this.observer=new MutationObserver(()=>{
                const next=[...doc.querySelectorAll('dialog[open]')].at(-1)||null;
                if(next!==modal){modal=next;if(this.timer)this.raise();}
            });this.observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
        }
    }
    show({title='获得奖励',lines=[]}={}) {
        if(!lines.length)return;
        for(let i=0;i<lines.length;i+=5)this.queue.push({title,lines:lines.slice(i,i+5)});if(!this.timer)this.next();
    }
    raise(){
        if(!this.root.showPopover)return;
        try{if(this.root.matches(':popover-open'))this.root.hidePopover();this.root.showPopover();}catch{/* Fixed-position fallback for older browsers. */}
    }
    next(){
        const notice=this.queue.shift();if(!notice){this.reset();return;}
        this.root.replaceChildren();
        const title=this.doc.createElement('span');title.className='global-reward-title';setText(title,notice.title);this.root.append(title);
        for(const line of notice.lines){
            const row=this.doc.createElement('strong');
            if(Array.isArray(line))setText(row,line[0],line[1]);
            else setText(row,line);
            this.root.append(row);
        }
        this.root.hidden=false;this.raise();
        this.timer=setTimeout(()=>{this.timer=null;this.next();},this.duration);
    }
    reset(){clearTimeout(this.timer);this.timer=null;this.queue.length=0;try{this.root.hidePopover?.();}catch{}this.root.hidden=true;this.root.replaceChildren();}
    dispose(){this.reset();this.observer?.disconnect();this.root.remove();}
}
