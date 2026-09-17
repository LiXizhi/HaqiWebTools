export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const pct=n=>(100*(n??0)).toFixed(1)+'%';
export function notice(message,error=false){const el=document.querySelector('#notice');el.textContent=message;el.className=error?'notice error':'notice';el.hidden=false;clearTimeout(el._timer);el._timer=setTimeout(()=>{el.hidden=true;},6500);}
export const guard=fn=>async(...args)=>{try{return await fn(...args);}catch(e){notice(e.message,true);console.error(e);}};
export function section(title,subtitle,body){return `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div>${body}`;}
