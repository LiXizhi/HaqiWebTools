import {GEM_FILTERS,gemEquipment,isGem,gemCompatibility,gemPreview} from './adventure_gems_core.js';
import {equipmentAttributes} from './adventure_equipment_core.js';

// Original kids workbench: three steps at left, seven equipment tabs and 3×3 pages at right.
export function renderGems(body,model,cb,{el,button,art}){
    const {save,assets,gemView:s}=model,c=assets.content;
    const shell=body.closest('.modal');shell?.classList.add('gem-modal');
    if(shell)shell.onkeydown=event=>{
        if(event.key==='Escape'){event.stopPropagation();cb.close();}
        if(event.key!=='Tab')return;
        const controls=[...shell.querySelectorAll('button:not(:disabled)')].filter(x=>x.getClientRects().length),first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    const layout=el('div','gem-layout'),left=el('section','gem-workbench'),right=el('section','gem-inventory');
    layout.append(left,right);body.append(layout);
    const picture=item=>item?.art?art(assets,item.art,48,48):el('span',`gem-symbol ${isGem(item)?'gem-crystal':'gem-rune'}`,isGem(item)?String(item.stats[41]):item?.id===17179?'调羹':'符');
    const label=(item,guid)=>item?equipmentAttributes(item,save,c,guid).map(x=>`${x.label} +${x.value}${x.unit}`).join('、'):'';
    function slot(item,text,fn){const b=button(item?[picture(item),el('small','',item.name)]:text,fn,'gem-slot');b.title=item?`${item.name}\n${label(item,item.kind===1?s.guid:undefined)}\n点击取出或重新选择`:text;return b;}
    function change(step){s.step=step;s.filter=0;s.page=0;s.confirm=false;s.message='';paint();}
    function submit(){
        const value=s.mode==='remove'?{type:'remove-gems',guid:s.guid,gemIds:s.removeIds}:{type:'mount-gem',guid:s.guid,gemId:s.gemId,runes:s.runes.filter(Boolean),confirmReplace:true};
        s.confirm=false;
        const result=cb.action(value);
        if(result!==false){s.message=result?.message||'宝石操作已完成。';s.gemId=null;s.runes=[null,null,null];s.removeIds=[];}
        cb.refresh?.();paint();
    }
    function paint(){
        left.replaceChildren();right.replaceChildren();
        const p=gemPreview(save,c,{...s,runes:s.runes.filter(Boolean)}),removing=s.mode==='remove';
        left.append(el('p','gem-intro',removing?'选择装备和需要剥离的宝石，剥离后可重新镶嵌。':'镶嵌宝石可以提高装备属性。镶嵌失败会让宝石降级或消失，请按步骤操作。'));
        left.append(el('h3','','1. 放入装备'),slot(p.item,'放入装备',()=>{s.guid=null;s.gemId=null;s.removeIds=[];change('equipment');}));
        if(p.item)left.append(el('p','gem-caption',`${p.item.name} · 宝石 ${p.ins.length}/${p.item.stats[36]}`));
        if(removing){
            left.append(el('h3','','2. 选择要剥离的宝石'));
            const gems=el('div','gem-sockets');
            for(const id of p.ins){const b=slot(c.items[id],String(id),()=>{s.removeIds=s.removeIds.includes(id)?s.removeIds.filter(x=>x!==id):[...s.removeIds,id];s.confirm=false;paint();});b.setAttribute('aria-pressed',String(s.removeIds.includes(id)));gems.append(b);}
            left.append(gems,el('p','',`宝石调羹：需要 ${s.removeIds.length} / 拥有 ${save.inventory[17179]||0}`),el('p','gem-caption','每颗消耗一个宝石调羹；成功率100%。'));
        }else{
            left.append(el('h3','','2. 放入宝石'),slot(p.gem,'放入宝石',()=>{s.gemId=null;change('gems');}));
            if(p.gem)left.append(el('p','gem-caption',label(p.gem)));
            left.append(el('h3','','3. 放入镶嵌符，提高成功率（最多100%）'));
            const runes=el('div','gem-runes');
            for(let i=0;i<3;i++)runes.append(slot(c.items[s.runes[i]],'增加成功率',()=>{s.runes[i]=null;s.runeIndex=i;change('runes');}));
            left.append(runes);
            if(p.ins.length)left.append(el('p','gem-caption',`已镶嵌：${p.ins.map(id=>c.items[id]?.name||id).join('、')}`));
        }
        left.append(button(removing?'返回宝石镶嵌':'宝石剥离',()=>{s.mode=removing?'mount':'remove';s.removeIds=[];change('equipment');},'secondary'));
        const error=removing?(!p.instance?'请先放入装备。':!s.removeIds.length?'请选择要剥离的宝石。':s.removeIds.length>(save.inventory[17179]||0)?'宝石调羹不足。':save.pendingEncounter?'请先完成当前战斗。':null):p.error;
        const status=el('p','gem-status',s.message||error|| (removing?'选中的宝石将返回背包。':`当前镶嵌成功率：${p.odds}%`));status.setAttribute('role','status');status.setAttribute('aria-live','polite');left.append(status);
        if(!removing&&error)left.append(el('p','gem-caption',`当前镶嵌成功率：${p.odds}%`));
        if(s.confirm&&!error){
            const confirm=el('div','gem-confirm',el('p','',removing?`消耗${s.removeIds.length}个宝石调羹，剥离选中的宝石？`:`成功率${p.odds}%，消耗1颗宝石及${s.runes.filter(Boolean).length}张镶嵌符。${p.replacement?'成功后原同类宝石会消失。':''}${p.odds<100?'失败时宝石会降级或消失。':''}`));
            confirm.append(button('确认'+(removing?'剥离':'镶嵌'),submit,'primary'),button('取消',()=>{s.confirm=false;paint();},'secondary'));left.append(confirm);
        }else{const go=button(removing?'开始剥离':'开始镶嵌',()=>{s.confirm=true;paint();},'primary gem-submit');go.disabled=!!error;left.append(go);}
        const nav=el('div','gem-tabs');
        for(const [key,name] of [['equipment','装备'],['gems','宝石'],['runes','镶嵌符']]){if(removing&&key!=='equipment')continue;const b=button(name,()=>change(key),'secondary');b.setAttribute('aria-pressed',String(s.step===key));nav.append(b);}
        right.append(nav);
        const filters=s.step==='equipment'?GEM_FILTERS.map(x=>x[0]):s.step==='gems'?['全部','1级','2级','3级','4级','5级']:['全部镶嵌符'];
        const tabs=el('div','gem-filters');filters.forEach((name,i)=>{const b=button(name,()=>{s.filter=i;s.page=0;paint();},'secondary');b.setAttribute('aria-pressed',String(s.filter===i));tabs.append(b);});right.append(tabs);
        let rows=s.step==='equipment'?gemEquipment(save,c,s.filter).filter(row=>!removing||row.serverdata.gem?.ins?.length).map(row=>({item:c.items[row.gsid],instance:row})):Object.values(c.items).filter(item=>(save.inventory[item.id]||0)>0&&(s.step==='gems'?isGem(item)&&(!s.filter||item.stats[41]===s.filter):[26701,26702,26703].includes(item.id))).map(item=>({item}));
        const pages=Math.max(1,Math.ceil(rows.length/9));s.page=Math.max(0,Math.min(s.page,pages-1));
        const grid=el('div','gem-grid');
        for(const {item,instance} of rows.slice(s.page*9,s.page*9+9)){
            const incompat=s.step==='gems'?gemCompatibility(p.item,item):null;
            const b=button([picture(item),el('span','',item.name),el('small','',instance?`+${instance.serverdata.addlel}${save.equipmentGuids?.[item.slot]===instance.guid?' · 已装备':''}`:`拥有 ${save.inventory[item.id]}`)],()=>{
                s.confirm=false;s.message='';
                if(instance){s.guid=instance.guid;s.gemId=null;s.removeIds=[];if(!removing){s.step='gems';s.filter=0;s.page=0;}}
                else if(s.step==='gems'){if(incompat){s.message=incompat;paint();return;}s.gemId=item.id;}
                else {const used=s.runes.filter(id=>id===item.id).length;if(used>=(save.inventory[item.id]||0)){s.message='该镶嵌符已全部放入。';paint();return;}const index=s.runes[s.runeIndex]==null?s.runeIndex:s.runes.indexOf(null);if(index<0){s.message='三个镶嵌符槽已满，点击左侧槽位取出。';paint();return;}s.runes[index]=item.id;}
                paint();
            },'gem-grid-slot');
            b.title=[item.name,label(item,instance?.guid),item.description,incompat].filter(Boolean).join('\n');
            b.setAttribute('aria-pressed',String(instance?instance.guid===s.guid:item.id===s.gemId||s.runes.includes(item.id)));grid.append(b);
        }
        if(!rows.length)grid.append(el('p','gem-empty',s.step==='equipment'?'没有符合条件的装备':s.step==='gems'?'背包中没有该等级的宝石':'背包中没有镶嵌符；镶嵌符可以提高成功率。'));
        while(grid.children.length<9)grid.append(el('div','gem-grid-slot empty'));
        const pager=el('div','gem-pager'),prev=button('上一页',()=>{s.page--;paint();},'secondary'),next=button('下一页',()=>{s.page++;paint();},'secondary');prev.disabled=s.page===0;next.disabled=s.page===pages-1;
        pager.append(prev,el('span','',`${s.page+1} / ${pages}`),next);right.append(grid,pager);
    }
    paint();
}
