import {STRENGTHENING_FILTERS,strengtheningItems,strengtheningPreview} from './adventure_strengthening_core.js';
// Kids MCML window: selected equipment → target properties / material; 4 × 3 paged inventory.
export function renderStrengthening(body,model,cb,{el,button,art}) {
    const {save,assets,strengtheningView:state}=model,c=assets.content;
    const shell=body.closest?.('.modal');
    shell?.classList.add('strengthening-modal');
    if(shell){
        shell.style.translate=`${state.offsetX||0}px ${state.offsetY||0}px`;
        const header=shell.querySelector('.modal-header');let drag=null;
        header.onpointerdown=event=>{
            if(event.button!==0||event.target.closest('button')||matchMedia('(max-width:700px)').matches)return;
            const rect=shell.getBoundingClientRect();drag={x:event.clientX,y:event.clientY,dx:state.offsetX||0,dy:state.offsetY||0,rect};header.setPointerCapture(event.pointerId);
        };
        header.onpointermove=event=>{
            if(!drag)return;
            const dx=Math.max(-drag.rect.left,Math.min(innerWidth-drag.rect.right,event.clientX-drag.x));
            const dy=Math.max(-drag.rect.top,Math.min(innerHeight-drag.rect.bottom,event.clientY-drag.y));
            state.offsetX=drag.dx+dx;state.offsetY=drag.dy+dy;shell.style.translate=`${state.offsetX}px ${state.offsetY}px`;
        };
        header.onpointerup=header.onpointercancel=()=>{drag=null;};
        shell.onkeydown=event=>{
            if(event.key==='Escape'){event.stopPropagation();cb.close();return;}
            if(event.key!=='Tab')return;
            const controls=[...shell.querySelectorAll('button:not(:disabled),summary')].filter(node=>node.getClientRects().length);
            const first=controls[0],last=controls.at(-1);
            if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
            else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
        };
    }
    for(const [key,row] of Object.entries(c.upgradeSkin||{}).filter(([key])=>['beans','pearl'].includes(key))) {
        const url=assets.mode==='local'?new URL(row.local,document.baseURI).href:row.cdn;
        if(url)shell?.style.setProperty(`--strength-${key}`,`url(${JSON.stringify(url)})`);
    }
    const layout=el('div','strengthening-layout'),left=el('section','strengthening-workbench'),right=el('section','strengthening-inventory');
    const heading=el('p','strengthening-instruction','请放入你要强化的装备');
    const slot=button('',()=>{state.guid=null;state.message='';paint();},'strengthening-slot');slot.setAttribute('aria-label','取出强化栏装备');
    const arrow=el('div','strengthening-arrow');arrow.setAttribute('aria-hidden','true');
    const preview=el('div','strengthening-preview'),material=el('div','strengthening-material'),status=el('p','strengthening-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const submit=button('强 化',()=>{
        const p=strengtheningPreview(save,c,state.guid);
        if(p.error){state.message=p.error;paint();return;}
        if(state.pending)return;
        state.pending=true;submit.disabled=true;
        try {
            const result=cb.action({type:'upgrade',itemId:p.item.id,guid:p.instance.guid});
            if(result===false){state.message='强化未成功，请检查材料后重试。';return;}
            state.message=`强化成功！${p.item.name} +${p.level+1}`;
        }finally{state.pending=false;cb.refresh?.();paint();}
    },'primary strengthening-submit');
    left.append(heading,slot,arrow,preview,el('h3','strengthening-material-title','强化材料'),material,submit,status);
    const tabs=el('div','strengthening-filters');
    STRENGTHENING_FILTERS.forEach((filter,index)=>{
        const b=button(filter.name,()=>{state.filter=index;state.page=0;paint();},'strengthening-filter');b.setAttribute('aria-pressed',String(index===state.filter));tabs.append(b);
    });
    const grid=el('div','strengthening-grid'),pager=el('div','strengthening-pager');
    right.append(tabs,grid,pager);layout.append(left,right);body.append(layout);
    function paint(){
        const p=strengtheningPreview(save,c,state.guid),rows=strengtheningItems(save,c,state.filter);
        const pages=Math.max(1,Math.ceil(rows.length/12));state.page=Math.max(0,Math.min(state.page||0,pages-1));
        [...tabs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===state.filter)));
        slot.replaceChildren();preview.replaceChildren();material.replaceChildren();grid.replaceChildren();pager.replaceChildren();
        slot.disabled=!p.item;
        if(p.item){
            slot.append(art(assets,p.item.art,64,64),el('span','strengthening-level',`+${p.level}`));
            slot.title=`${p.item.name} +${p.level}，点击取出`;
            preview.append(el('strong','',`${p.item.name}：+${p.next?p.level+1:p.level}`));
            // GetProps L92–118: preserve the original labels (including its fixed-defence % suffix).
            if(p.next){
                const row=p.next,attack=row.attack_percentage??row.attack_absolute;
                for(const [value,label,unit] of [[attack,'强化攻击','%'],[row.hp,'强化HP',''],[row.resist_absolute,'强化防御','%'],[row.resilience_percentage,'韧性','%'],[row.critical_strike_percent,'暴击','%']])if(value!==undefined)preview.append(el('div','',`${label}：+${value}${unit}`));
            }
            else preview.append(el('p','','已经强化到满级了'));
            if(p.next){
                const icon=el('div','strengthening-material-icon');
                icon.style.backgroundImage=`var(--strength-${p.next.cost[0]===17213?'beans':'pearl'})`;
                icon.setAttribute('role','img');icon.setAttribute('aria-label',p.material?.name||'强化材料');
                material.append(icon,el('div','',el('strong','',p.material?.name||`材料 ${p.next.cost[0]}`),el('div','',`需要 ${p.next.cost[1]}`),el('div',p.held<p.next.cost[1]?'strengthening-shortage':'',`拥有 ${p.held}`)));
                const source=String(p.material?.description||'').replaceAll('#','；');if(source)material.title=source;
            }
        }else preview.append(el('p','','放入装备后查看强化属性'));
        submit.disabled=!!state.pending||!!save.pendingEncounter;
        status.textContent=state.message||p.error||'每次强化一级，材料足够即可强化。';
        for(const instance of rows.slice(state.page*12,state.page*12+12)) {
            const item=c.items[instance.gsid],equipped=save.equipmentGuids?.[item.slot]===instance.guid;
            const b=button([art(assets,item.art,64,64),el('span','strengthening-level',`+${instance.serverdata.addlel}`),equipped?el('small','strengthening-equipped','已装备'):null],()=>{state.guid=instance.guid;state.message='';paint();},'strengthening-grid-slot');
            b.setAttribute('aria-label',`${item.name} +${instance.serverdata.addlel}${equipped?' 已装备':''}，放入强化栏`);
            b.setAttribute('aria-pressed',String(instance.guid===state.guid));b.title=`${item.name} +${instance.serverdata.addlel}\n${String(item.description||'').replaceAll('#','\n')}`;grid.append(b);
        }
        if(!rows.length)grid.append(el('p','strengthening-empty','没有可强化的装备'));
        while(grid.children.length<12)grid.append(el('div','strengthening-grid-slot empty'));
        const previous=button('上一页',()=>{state.page--;paint();},'secondary strengthening-previous'),next=button('下一页',()=>{state.page++;paint();},'secondary strengthening-next');
        previous.disabled=state.page===0;next.disabled=state.page===pages-1;
        pager.append(previous,el('span','',`${state.page+1} / ${pages}`),next);
    }
    paint();
}
