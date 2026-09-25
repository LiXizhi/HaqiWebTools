import {fishingTuning as tuning,fishWeight,fishingSpecies,fishSize} from './adventure_fishing_records_core.js';
import {createRng,hashSeed} from './rng_core.js';
import { readStamina } from './adventure_fishing_core.js';
import { createCloseButton } from './view_adventure_controls.js';
import { setText } from './locale_runtime.js';
import { drawFishingScene, fishingCatchLayout } from './view_adventure_fishing_art.js';
import {fishingPullMotion,FISHING_PULL_MS} from './view_adventure_fishing_motion.js';

const DIRECTIONS=[{id:'up',label:'上',symbol:'↑',x:0,y:-1},{id:'right',label:'右',symbol:'→',x:1,y:0},{id:'down',label:'下',symbol:'↓',x:0,y:1},{id:'left',label:'左',symbol:'←',x:-1,y:0}];
const KEY_DIRECTION={ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',ArrowLeft:'left',KeyW:'up',KeyD:'right',KeyS:'down',KeyA:'left'};
const CAST_MS=600, REEL_MS=1100, SHOW_MS=4200;
// Transient scene state; the callback remains the only inventory/persistence boundary.
export function createSceneFishing(root, cb, { el, button }) {
    const layer=el('div','scene-fishing');layer.hidden=true;
    const canvas=el('canvas','fishing-effects');canvas.setAttribute('aria-hidden','true');
    const context=canvas.getContext('2d');
    const status=el('div','fishing-status');status.setAttribute('role','status');
    const trigger=button('抛竿',()=>act(),'fishing-trigger');
    const directions=DIRECTIONS.map(d=>{
        const node=button('',()=>act(d.id),'fishing-direction');
        node.append(el('span','fishing-direction-glyph',`${d.symbol} ${d.label}`));
        node.dataset.direction=d.id;node.setAttribute('aria-label',`向${d.label}提竿`);
        node.setAttribute('aria-keyshortcuts',`Arrow${d.id[0].toUpperCase()}${d.id.slice(1)}`);
        return node;
    });
    const caught=el('div','fishing-catch-label');caught.setAttribute('role','status');
    const select=el('select','fishing-select');select.setAttribute('aria-label','选择捕鱼道具');
    const stamina=el('small','fishing-energy');
    const potions=el('div','fishing-potions');
    const gear=button('渔具',()=>{records.hidden=true;recordsButton.setAttribute('aria-expanded','false');tools.hidden=!tools.hidden;gear.setAttribute('aria-expanded',String(!tools.hidden));},'fishing-gear');
    gear.setAttribute('aria-expanded','false');
    const tools=el('section','fishing-tools',select,el('small','','沿用背包中的渔网和捕鱼器，每次成功结算消耗一份。'),potions);tools.hidden=true;
    tools.setAttribute('aria-label','捕鱼道具');
    const species=el('select','fishing-select');species.setAttribute('aria-label','选择鱼种排行榜');
    const recordList=el('div','fishing-record-list');
    const records=el('section','fishing-records',el('strong','','个人重量榜'),species,recordList,el('small','','每种鱼保留前十；重量不影响奖励。随角色保存，登录后同步。'));records.hidden=true;
    records.setAttribute('aria-label','个人钓鱼排行榜');
    const recordsButton=button('纪录',()=>{records.hidden=!records.hidden;tools.hidden=true;gear.setAttribute('aria-expanded','false');recordsButton.setAttribute('aria-expanded',String(!records.hidden));refreshRecords();},'fishing-gear');
    recordsButton.setAttribute('aria-expanded','false');
    species.addEventListener('change',refreshRecords);
    const controls=el('div','fishing-controls',stamina,gear,recordsButton,createCloseButton(()=>stop(),'结束钓鱼'));
    layer.append(canvas,status,trigger,...directions,caught,controls,tools,records);root.append(layer);
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let active=false,model,water,netId=null,phase='idle',at=0,castNumber=0,biteAt=0,pending=null,result=null,lastInventory='',count=0;
    let lastSize='',pulls=0,pullGoal=3,fightRng,nextBite=0,lastPull=-Infinity,expectedDirection=null,rounds=0,mistakes=0,restPenalized=false;
    let pullDirection=null,pullAt=-Infinity,pullFeedback='';
    function pulse(pattern){if(!reduced.matches)cb.vibrate?.(pattern);}
    function refreshRecords(){
        const id=Number(species.value)||fishingSpecies[0],rows=model.save.fishingRecords?.byFish[id]||[];
        recordList.replaceChildren();
        if(!rows.length)recordList.append(el('p','','还没有这条鱼的纪录，去试试吧。'));
        rows.forEach((row,i)=>recordList.append(el('div','fishing-record-row',el('span','',`第 ${i+1} 名`),el('strong','',fishWeight(row.grams)))));
    }
    function say(text){setText(status,text);}
    function net(){return model.assets.content.fishing.nets.find(row=>row.id===netId);}
    function busy(){return !['idle','show'].includes(phase);}
    function refresh(){
        const {save,assets:{content}}=model,catalog=content.fishing;
        const signature=JSON.stringify([catalog.nets.map(n=>save.inventory[n.id]),catalog.potions.map(p=>save.inventory[p.id]),save.stamina,save.fishingRecords?.total]);
        if(signature===lastInventory)return;
        lastInventory=signature;refreshRecords();
        const owned=catalog.nets.filter(n=>save.inventory[n.id]>0);
        if(!owned.some(n=>n.id===netId))netId=owned[0]?.id??null;
        select.replaceChildren();
        for(const item of catalog.nets){
            const quantity=save.inventory[item.id]||0;
            const option=el('option','',`${content.items[item.id].name} ×${quantity}`);
            option.value=String(item.id);option.disabled=!quantity;option.selected=item.id===netId;select.append(option);
        }
        setText(stamina,`精力 ${readStamina(save,content)} · 渔获 ${count}`);
        potions.replaceChildren();
        for(const item of catalog.potions){
            if(item.blocked||!(save.inventory[item.id]>0))continue;
            potions.append(button(`使用${content.items[item.id].name} ×${save.inventory[item.id]}`,()=>{
                if(busy())return;
                const answer=cb.action({type:'stamina-potion',itemId:item.id});say(answer?.message||'药剂使用失败，请重试。');lastInventory='';
            },'secondary'));
        }
    }
    select.addEventListener('change',()=>{if(busy())return;netId=Number(select.value);say(net()?.absolutelyHit?'必中道具会自动提竿':'咬钩后，按金色方向提竿；方向键或 WASD 也可以');});
    function state(next,time=performance.now()){
        phase=next;at=time;layer.dataset.phase=next;
        layer.dataset.direction=next==='bite'?expectedDirection||'':'';
        for(const node of directions){node.dataset.active=String(next==='bite'&&node.dataset.direction===expectedDirection);}
        const labels={idle:'抛竿',cast:'抛线中',wait:'等咬钩',bite:'提竿！',rest:'松线',reel:'收杆中',show:'再抛一竿'};
        setText(trigger,labels[next]);trigger.setAttribute('aria-label',labels[next]);
    }
    function start(point,value){
        pullDirection=null;pullAt=-Infinity;
        if(!active)cb.activeChanged?.(true);
        model=value;water={...point};active=true;pending=null;result=null;castNumber=0;count=0;lastInventory='';
        layer.hidden=false;root.classList.add('is-fishing');tools.hidden=true;caught.hidden=true;gear.setAttribute('aria-expanded','false');
        species.replaceChildren();
        for(const id of fishingSpecies){const option=el('option','',model.assets.content.items[id]?.name||'鱼');option.value=String(id);species.append(option);}
        records.hidden=true;recordsButton.setAttribute('aria-expanded','false');
        state('idle');refresh();act();
    }
    function stop(restoreFocus=true){
        if(!active)return;
        cb.activeChanged?.(false);cb.vibrate?.(0);active=false;pending=null;result=null;pullDirection=null;pullAt=-Infinity;layer.hidden=true;root.classList.remove('is-fishing');
        if(restoreFocus)cb.focus?.();
    }
    function act(direction){
        if(!active)return;
        const now=performance.now();
        advance(now);
        // Water taps and Space only cast; they cannot substitute for a direction.
        if(busy()&&!direction)return;
        if(phase==='cast'||phase==='reel')return;
        if(direction&&['wait','bite','rest'].includes(phase)&&!pending?.automatic){
            pullDirection=direction;pullAt=now;
            pullFeedback=phase==='bite'?(direction===expectedDirection?'good':'miss'):'neutral';
        }
        if(phase==='wait'){
            if(pending?.automatic)return;
            say('别急，等金色方向亮起；按中一次就有收获');return;
        }
        if(phase==='rest'){if(now-lastPull>tuning.fishingInputGraceMs&&!restPenalized){mistakes=Math.min(pullGoal,mistakes+1);restPenalized=true;say('松线稍等，收得太急会让鱼变小');}return;}
        if(phase==='bite'){resolvePull(direction===expectedDirection,now);return;}
        if(direction||(phase!=='idle'&&phase!=='show'))return;
        if(!net()){say('没有捕鱼道具了，看看米酒葫芦吧');tools.hidden=false;gear.setAttribute('aria-expanded','true');return;}
        if(readStamina(model.save,model.assets.content)<net().staminaRequired){say('精力不足，打开渔具使用药剂');return;}
        result=null;caught.hidden=true;tools.hidden=true;records.hidden=true;recordsButton.setAttribute('aria-expanded','false');gear.setAttribute('aria-expanded','false');
        pending={netId,automatic:!!net().absolutelyHit};
        fightRng=createRng(hashSeed(`${model.save.seed}:${model.save.revision}:${castNumber}:fish-fight`));
        pulls=0;pullGoal=fightRng.int(tuning.fishingMinPulls,tuning.fishingMaxPulls);lastPull=-Infinity;expectedDirection=null;rounds=0;mistakes=0;restPenalized=false;
        // Deterministic visual variation, independent of the reward RNG.
        biteAt=now+CAST_MS+1400+(castNumber++%3)*420;
        state('cast',now);say('抛竿…');
    }
    function resolvePull(correct,time){
        rounds++;if(correct){pulls++;pulse([30,35,45]);}else pulse(15);
        lastPull=time;restPenalized=false;
        if(rounds>=pullGoal){finish(pulls>0,time,pulls?'稳稳收鱼！':'这次没有按中，再试一次吧');return;}
        nextBite=time+fightRng.int(tuning.fishingRestMinMs,tuning.fishingRestMaxMs);
        state('rest',time);say(`${correct?'拉住了！':pulls?'鱼还在！这次会小一点':'没关系，下次按中就有收获'} ${rounds}/${pullGoal} · 松线稍等`);
    }
    function finish(hit,time,message){
        if(!pending)return;
        const action={type:'fish',netId:pending.netId,hit,fishingPerformance:pending.automatic?{hits:1,rounds:2,mistakes:0}:{hits:pulls,rounds:pullGoal,mistakes}};pending=null;
        const answer=cb.action(action);
        result=answer&&typeof answer==='object'?answer:null;
        if(result?.caught)count+=result.items.reduce((sum,item)=>sum+item.count,0);
        lastInventory='';
        if(!result){state('idle',time);say('保存失败，请重试');return;}
        state('reel',time);
        say(result.caught?'钓到了！':message||result.message||'鱼儿溜走了');
        const weighed=result?.catches||[];
        const best=weighed.filter(row=>row.rank).sort((a,b)=>a.rank-b.rank)[0];
        const trophy=weighed.slice().sort((a,b)=>b.grams-a.grams)[0];
        const size=fishSize(trophy?.grams||0);
        const title=size==='huge'?'巨物上岸！':size==='large'?'大鱼上岸！':'';
        const caption=weighed.length?weighed.map(row=>`${model.assets.content.items[row.itemId]?.name||'鱼'} ${fishWeight(row.grams)}`).join('、'):result?.items?.map(item=>`${item.name} ×${item.count}`).join('、');
        setText(caught,result.caught?`${title?title+'\n':''}${caption}${best?`\n${best.newBest?'个人新纪录！':`进入该鱼种前十 · 第 ${best.rank} 名`}`:''}`:'');
        if(best)species.value=String(best.itemId);
        pulse(result.caught?(size==='normal'?[55,50,90]:[70,40,90,50,130]):[60]);
    }
    function advance(time){
        if(phase==='cast'&&time-at>=CAST_MS){state('wait',at+CAST_MS);say('等浮漂沉下去…');}
        if((phase==='wait'&&time>=biteAt)||(phase==='rest'&&time>=nextBite)){
            const start=phase==='wait'?biteAt:nextBite;
            const choices=DIRECTIONS.filter(d=>d.id!==expectedDirection);
            const chosen=choices[fightRng.int(0,choices.length-1)];expectedDirection=chosen.id;
            state('bite',start);say(`向${chosen.label}提竿！ ${rounds+1}/${pullGoal}`);pulse(25);
        }
        if(phase==='bite'){
            if(pending?.automatic)finish(true,time);
            else if(!reduced.matches&&time-at>tuning.fishingBiteMs-rounds*tuning.fishingWindowStepMs)resolvePull(false,time);
        }
        if(phase==='reel'&&time-at>=REEL_MS){state('show',at+REEL_MS);say(result?.caught?'好收获！':result?.message||'再试一次吧');}
        if(phase==='show'&&time-at>SHOW_MS){state('idle',time);result=null;caught.hidden=true;say('再来一竿？');}
    }
    function aim(point){if(active&&point&&cb.isWater(point))act();}
    function key(event){
        if(!active)return false;
        if(event.key==='Escape'){stop();return true;}
        if(['SELECT','INPUT','TEXTAREA'].includes(event.target.tagName))return false;
        if(KEY_DIRECTION[event.code]){if(!event.repeat)act(KEY_DIRECTION[event.code]);return true;}
        if(event.code==='Space'&&!['SELECT','INPUT','TEXTAREA','BUTTON'].includes(event.target.tagName)){
            if(!event.repeat)act();return true;
        }
        return false;
    }
    layer.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();stop();}
        if(event.repeat&&event.code==='Space')event.preventDefault();
    });
    function pose(time){
        if(!active||!model?.save.position)return null;
        const hero=model.save.position,side=water.x<hero.x?-1:1;
        const elapsed=Math.max(0,time-at),animate=!reduced.matches;
        const lean=animate?(phase==='cast'?Math.sin(elapsed/CAST_MS*Math.PI)*side*.16:phase==='reel'?-side*Math.sin(Math.min(1,elapsed/REEL_MS)*Math.PI)*.23:phase==='rest'?-side*(.12+Math.sin(elapsed/35)*.035):phase==='bite'?-side*(.06+Math.sin(elapsed/45)*.025):0):0;
        const lift=animate&&phase==='show'&&result?.caught?Math.max(0,Math.sin(Math.min(1,elapsed/420)*Math.PI))*10:0;
        const pull=fishingPullMotion(pullDirection,time-pullAt,reduced.matches);
        return {facing:side<0?1:2,lean:lean+pull.x*.2,lift:lift-pull.y*9,pullX:pull.x,pullY:pull.y};
    }
    function update(value,time,project){
        if(!active)return;
        model=value;advance(time);refresh();
        const w=root.clientWidth,h=root.clientHeight,dpr=Math.min(2,globalThis.devicePixelRatio||1);
        if(`${w}:${h}:${dpr}`!==lastSize){lastSize=`${w}:${h}:${dpr}`;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
        context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,w,h);
        const hero=project(model.save.position),target=project(water),origin=project({x:0,y:0}),unit=project({x:1,y:1});
        const scale=Math.abs(unit.x-origin.x),side=target.x<hero.x?-1:1;
        const drawing={width:w,height:h,phase,elapsed:Math.max(0,time-at),time,hero,target,scale,pose:pose(time),reduced:reduced.matches,result,compact:h<520};
        drawFishingScene(context,drawing,model.assets);
        function place(node,x,y,margin=30){node.style.left=`${Math.max(margin,Math.min(w-margin,x))}px`;node.style.top=`${Math.max(24,Math.min(h-36,y))}px`;}
        place(trigger,hero.x-side*70,hero.y+(h<520?35:-30));
        status.hidden=!!(result?.caught&&phase==='show');
        const centerY=hero.y-40*scale,compact=h<520;
        const ringY=compact?68:78;
        directions.forEach((node,i)=>{
            const d=DIRECTIONS[i];place(node,hero.x+d.x*86,centerY+d.y*ringY,34);
            const responding=d.id===pullDirection&&time-pullAt>=0&&time-pullAt<FISHING_PULL_MS;
            const impulse=responding?fishingPullMotion(pullDirection,time-pullAt,reduced.matches):{x:0,y:0,strength:0};
            node.dataset.feedback=responding?pullFeedback:'';
            node.style.setProperty('--pull-x',`${impulse.x*7}px`);
            node.style.setProperty('--pull-y',`${impulse.y*7}px`);
            node.style.setProperty('--pull-scale',String(1-impulse.strength*.13));
            node.style.setProperty('--pull-ring',String(1+impulse.strength*.32));
            node.hidden=!['cast','wait','bite','rest'].includes(phase);node.disabled=phase==='cast'||!!pending?.automatic;
        });
        place(status,compact?hero.x+side*195:hero.x,compact?Math.max(32,hero.y-70):centerY-128,110);
        place(controls,hero.x,hero.y+108,Math.min(145,w/2));
        place(tools,h<520?hero.x+side*185:hero.x,h<520?Math.max(24,hero.y-90):hero.y+144,Math.min(130,w/2));
        place(records,h<520?hero.x+side*185:hero.x,h<520?Math.max(24,hero.y-160):Math.max(24,Math.min(h-270,hero.y+144)),Math.min(140,w/2));
        const trophyLayout=fishingCatchLayout(drawing);
        place(caught,trophyLayout.labelX,trophyLayout.labelY,110);
        caught.hidden=!(result?.caught&&phase==='show');
        if(!caught.hidden){
            // Wrapped names / double catches must stay readable even near the top edge.
            const halfWidth=(caught.offsetWidth||220)/2,halfHeight=(caught.offsetHeight||76)/2;
            caught.style.left=`${Math.max(halfWidth+8,Math.min(w-halfWidth-8,trophyLayout.labelX))}px`;
            caught.style.top=`${Math.max(halfHeight+8,Math.min(h-halfHeight-8,trophyLayout.labelY))}px`;
        }
        trigger.hidden=!['idle','show'].includes(phase);
        trigger.disabled=['cast','reel'].includes(phase);
        gear.disabled=busy();recordsButton.disabled=busy();select.disabled=busy()||!netId;
        for(const node of potions.children)node.disabled=busy();
    }
    return {start,stop,aim,key,update,pose,get active(){return active;}};
}
