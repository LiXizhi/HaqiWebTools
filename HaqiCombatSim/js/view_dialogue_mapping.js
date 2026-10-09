import {mappingColor} from './dialogue_mapping_core.js';

// Shared word spans and responsive connectors for NPC and learning conversations.
export function renderDialogueMapping(text,labels,result){
    let disposed=false;
    const words=[[],[]];
    result.forEach((parts,i)=>{labels[i].replaceChildren(...parts.map(part=>{
        const span=document.createElement('span');span.textContent=part.text;const color=mappingColor(part);
        if(color){words[i].push({span,color});span.className=/[\u3400-\u9fff]/u.test(part.text)?'dialogue-mapped-word is-cjk':'dialogue-mapped-word';span.style.color=color;span.style.fontWeight='600';span.title='同色框和连线表示对应词义';}
        return span;
    }));});
    if(!words[0].length)return ()=>{};
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('class','dialogue-mapping-links');svg.setAttribute('aria-hidden','true');
    text.append(svg);text.classList.add('has-word-mapping');
    let frame=0;
    const draw=()=>{
        if(disposed)return;
        const area=text.getBoundingClientRect();
        svg.setAttribute('viewBox',`0 0 ${area.width} ${area.height}`);
        svg.replaceChildren();
        for(const {span,color} of words[0]){
            const partner=words[1].find(word=>word.color===color);if(!partner)continue;
            const upper=[...span.getClientRects()].at(-1),lower=partner.span.getClientRects()[0];
            if(!upper||!lower)continue;
            const x1=(upper.left+upper.right)/2-area.left,y1=upper.bottom-area.top;
            const x2=(lower.left+lower.right)/2-area.left,y2=lower.top-area.top;
            const middle=(y1+y2)/2,path=document.createElementNS(ns,'path');
            path.setAttribute('d',`M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`);
            path.setAttribute('stroke',color);svg.append(path);
        }
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
    const observer=new ResizeObserver(schedule);observer.observe(text);
    document.fonts?.ready.then(()=>{if(!disposed)schedule();});schedule();
    return ()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame);svg.remove();text.classList.remove('has-word-mapping');};
}
