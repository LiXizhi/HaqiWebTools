// PvE battle presentation: pixel scene on the canvas, hand/actions in DOM, sequential event playback.
import {drawSprite} from './sprites.js';
import {drawable,cardFacePath,assetURL} from '../assets/cdn.js';
import {SCHOOL_COLORS,SCHOOL_NAMES} from '../../rules/formulas.js';
import {describeCard as cardDescription} from '../combat/card-text.js';
import {describeEvent} from '../combat/encounter.js';
import {esc} from '../../views/dom.js';
const $=s=>document.querySelector(s);
const EVENT_MS={cast:650,damage:520,heal:520,fizzle:600,pass:400,stun:500,death:600,turn:200,draw:0,recycle:0,discard:0,skip:300,end:800};
export function createBattleScene({encounter,profile,data,playerSprite,mobSprites,backdrop=null,onFinished,onFlee}) {
  const enc=encounter,ruleset=data.ruleset;
  const scene={time:0,queue:[],current:null,floats:[],speech:new Map(),selectedSeq:null,pendingTargets:null,busy:false,done:false,flash:new Map(),layout:new Map()};
  const ui=$('#battle-ui'),hand=$('#battle-hand'),log=$('#battle-log'),hint=$('#battle-hint'),turn=$('#battle-turn'),result=$('#battle-result');
  const unitName=id=>enc.unit(id)?.name??id;
  function addLog(text,side){if(!text)return;const line=document.createElement('div');line.className=side===0?'mine':'theirs';line.textContent=text;log.append(line);while(log.children.length>60)log.firstChild.remove();log.scrollTop=log.scrollHeight;}
  function renderHand() {
    const obs=enc.observation();turn.textContent=`第 ${Math.ceil(obs.turn/2)} 轮`;
    const me=obs.units.find(u=>u.id===enc.playerId);
    hint.textContent=scene.busy?'':scene.pendingTargets?'选择目标：点击敌人或队友':me.stun?'你被眩晕了，只能跳过':`魔力 ●${me.pips} ◆${me.powerPips} · 选择一张卡牌`;
    const legalCards=new Set(obs.legalActions.filter(a=>a.kind==='cast').map(a=>a.seq));
    hand.innerHTML=obs.hand.map(h=>{const card=ruleset.cards[h.key];const face=cardFacePath(card);const url=face?assetURL(face):null;const legal=legalCards.has(h.seq)&&!scene.busy;
      return `<button class="card ${scene.selectedSeq===h.seq?'selected':''}" data-seq="${h.seq}" ${legal?'':'disabled'} title="${esc(cardDescription(card,ruleset))}${card.accuracy<100?` · 命中 ${card.accuracy}%`:''}" style="border-color:${legal?SCHOOL_COLORS[card.school]:'#3a4a5a'}">${url?`<img src="${url}" alt="">`:`<div style="padding:26px 4px 0;font-size:11px;color:${SCHOOL_COLORS[card.school]}">${esc(SCHOOL_NAMES[card.school])}</div>`}<span class="card-cost">${card.pipcost<0?'X':card.pipcost}</span><span class="card-name">${esc(card.name??h.key)}</span></button>`;}).join('');
    hand.querySelectorAll('.card').forEach(btn=>btn.addEventListener('click',()=>selectCard(Number(btn.dataset.seq))));
    $('#battle-pass').disabled=scene.busy||scene.done;
  }
  function selectCard(seq) {
    if(scene.busy||scene.done)return;
    const obs=enc.observation();const options=obs.legalActions.filter(a=>a.kind==='cast'&&a.seq===seq);
    if(!options.length)return;
    scene.selectedSeq=seq;
    const targets=[...new Set(options.map(a=>a.targetId))];
    if(targets.length===1){submit(options[0]);return;}
    scene.pendingTargets={options,targets};renderHand();
  }
  function submit(action) {
    scene.selectedSeq=null;scene.pendingTargets=null;scene.busy=true;renderHand();
    let groups;
    try{groups=enc.playerTurn(action);}catch(e){scene.busy=false;addLog(e.message,0);renderHand();return;}
    for(const g of groups){for(const a of g.actions)if(a.speak)scene.queue.push({type:'speak',caster:a.unitId,text:a.speak,side:g.side});for(const e of g.events)scene.queue.push({...e,side:g.side});}
  }
  function playEvent(e) {
    const text=describeEvent(e,enc.state,ruleset);addLog(text,e.side);
    if(e.type==='damage'){scene.floats.push({id:e.target,text:`-${e.actual}${e.mark?` ${e.mark}`:''}`,color:e.mark==='暴击'?'#ffb02e':'#ff6b5a',t:0});scene.flash.set(e.target,.25);}
    if(e.type==='heal'&&e.amount>0)scene.floats.push({id:e.target,text:`+${e.amount}`,color:'#8dff8a',t:0});
    if(e.type==='fizzle')scene.floats.push({id:e.caster,text:'失败',color:'#ccc',t:0});
    if(e.type==='cast')scene.speech.set(e.caster,{text:ruleset.cards[e.card]?.name??e.card,t:1.2});
    if(e.type==='speak')scene.speech.set(e.caster,{text:e.text,t:2.2});
    if(e.type==='death'){const u=enc.unit(e.target);const mob=u&&u.kind==='mob'?enc.mobOf(u):null;if(mob?.speakDead)scene.speech.set(e.target,{text:mob.speakDead,t:2});}
    if(e.type==='end')finish();
  }
  function finish() {
    scene.done=true;scene.busy=true;renderHand();
    const rewards=enc.rewards();
    onFinished(rewards,enc.result);
  }
  scene.showResult=(html)=>{result.innerHTML=html;result.hidden=false;};
  scene.update=(dt)=>{
    scene.time+=dt;
    for(const [id,v] of scene.flash){v>dt?scene.flash.set(id,v-dt):scene.flash.delete(id);}
    for(const [id,s] of scene.speech){s.t-=dt;if(s.t<=0)scene.speech.delete(id);}
    scene.floats=scene.floats.filter(f=>(f.t+=dt)<1.1);
    if(scene.current){scene.current.t-=dt*1000;if(scene.current.t>0)return;scene.current=null;}
    if(scene.queue.length){const e=scene.queue.shift();playEvent(e);const ms=e.type==='speak'?900:(EVENT_MS[e.type]??300);if(ms>0)scene.current={t:ms};return;}
    if(scene.busy&&!scene.done){scene.busy=false;renderHand();}
  };
  scene.draw=(ctx,width,height)=>{
    ctx.save();
    if(backdrop?.image){ctx.imageSmoothingEnabled=false;ctx.drawImage(backdrop.image,backdrop.sx,backdrop.sy,backdrop.sw,backdrop.sh,0,0,width,height);const g=ctx.createLinearGradient(0,0,0,height);g.addColorStop(0,'#0a1420aa');g.addColorStop(.5,'#0a142055');g.addColorStop(1,'#0a1420cc');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
    else{const g=ctx.createLinearGradient(0,0,0,height);g.addColorStop(0,'#1d3b55');g.addColorStop(.55,'#2e5a3a');g.addColorStop(1,'#1e3a26');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);}
    ctx.fillStyle='#00000033';ctx.beginPath();ctx.ellipse(width*.26,height*.6,120,26,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(width*.72,height*.6,150,40,0,0,Math.PI*2);ctx.fill();
    const units=enc.state.units;scene.layout.clear();
    const mobs=units.filter(u=>u.side===1),playerY=height*.58;
    const place=(u)=>{if(u.side===0)return [width*.26,playerY];const i=u.slot,n=mobs.length;const spread=Math.min(height*.16,110);return [width*.68+(i%2)*width*.08,playerY-(n-1)*spread/2+i*spread];};
    for(const u of [...units].sort((a,b)=>place(a)[1]-place(b)[1])) {
      const [x,y]=place(u);scene.layout.set(u.id,{x,y});
      const dead=u.hp<=0;
      ctx.fillStyle='#00000055';ctx.beginPath();ctx.ellipse(x,y+2,22,7,0,0,Math.PI*2);ctx.fill();
      const sprite=u.side===0?playerSprite:mobSprites[u.slot];
      const bob=dead?0:Math.sin(scene.time*3+u.slot)*2;
      const box=drawSprite(ctx,sprite,u.side===0?'right':'left',dead?0:Math.floor(scene.time*2)%2*2,x,y+bob,{scale:u.side===0?3:3.2,alpha:dead?.35:1,flash:scene.flash.has(u.id)});
      if(scene.pendingTargets?.targets.includes(u.id)){ctx.strokeStyle='#ffe066';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(box.x-4,box.y-4,box.w+8,box.h+8);ctx.setLineDash([]);}
      // name, HP bar, pips, statuses
      const top=box.y-8;ctx.font='12px "PingFang SC","Microsoft YaHei",system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#0a0f14aa';ctx.fillRect(x-52,top-30,104,30);
      ctx.fillStyle=SCHOOL_COLORS[u.school];ctx.fillText(`Lv${u.level} ${u.name}`,x,top-16);
      ctx.fillStyle='#2b1a1a';ctx.fillRect(x-48,top-14,96,8);ctx.fillStyle=u.side===0?'#7ad67a':'#e06060';ctx.fillRect(x-48,top-14,96*Math.max(0,u.hp/u.attributes.maxHP),8);ctx.fillStyle='#fff';ctx.font='9px system-ui';ctx.fillText(`${u.hp}/${u.attributes.maxHP}`,x,top-6);
      let px=x-48;for(let i=0;i<u.pips;i++){ctx.fillStyle='#fff';ctx.fillRect(px,top-2,5,5);px+=7;}for(let i=0;i<u.powerPips;i++){ctx.fillStyle='#ffd84a';ctx.beginPath();ctx.moveTo(px+3,top-3);ctx.lineTo(px+6,top);ctx.lineTo(px+3,top+3);ctx.lineTo(px,top);ctx.fill();px+=7;}
      let sx=x-48,sy=box.y+box.h+4;const badge=(color,label)=>{ctx.fillStyle=color;ctx.fillRect(sx,sy,14,14);ctx.fillStyle='#000';ctx.font='bold 9px system-ui';ctx.textBaseline='middle';ctx.fillText(label,sx+7,sy+7);sx+=16;};
      for(const c of u.charms)badge(ruleset.effects.charmlist[c.id]?.positive===false?'#d98cff':'#ffb02e','C');for(const w of u.wards)badge(ruleset.effects.wardlist[w.id]?.positive===false?'#ff8c8c':'#8fd3ff','W');for(const a of u.absorbs)badge('#bfe9ff',a.amount>99?'A':String(a.amount));if(u.dots.length)badge('#ff7a5a','D');if(u.hots.length)badge('#8dff8a','H');if(u.stun)badge('#ffe066','眩');
      const s=scene.speech.get(u.id);
      if(s){ctx.font='12px "PingFang SC","Microsoft YaHei",system-ui';ctx.textBaseline='middle';const text=s.text.length>28?s.text.slice(0,28)+'…':s.text;const w=ctx.measureText(text).width+16;const bx=Math.max(8,Math.min(width-w-8,x-w/2)),by=top-58;ctx.fillStyle='#fff';ctx.fillRect(bx,by,w,22);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(x-5,by+22);ctx.lineTo(x+5,by+22);ctx.lineTo(x,by+28);ctx.fill();ctx.fillStyle='#222';ctx.fillText(text,bx+w/2,by+11);}
    }
    for(const f of scene.floats){const p=scene.layout.get(f.id);if(!p)continue;ctx.font='bold 16px system-ui';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#000a';ctx.fillText(f.text,p.x+1,p.y-70-f.t*40+1);ctx.fillStyle=f.color;ctx.globalAlpha=Math.max(0,1-f.t*.8);ctx.fillText(f.text,p.x,p.y-70-f.t*40);ctx.globalAlpha=1;}
    ctx.restore();
  };
  scene.tap=(x,y)=>{
    if(!scene.pendingTargets)return;
    let best=null,bd=80;for(const id of scene.pendingTargets.targets){const p=scene.layout.get(id);if(!p)continue;const d=Math.hypot(p.x-x,p.y-y-40);if(d<bd){best=id;bd=d;}}
    if(best){const action=scene.pendingTargets.options.find(a=>a.targetId===best);submit(action);}
  };
  scene.submitAction=action=>{if(scene.busy||scene.done)return;submit(action);};
  scene.pass=()=>{if(scene.busy||scene.done)return;const obs=enc.observation();const pass=obs.legalActions.find(a=>a.kind==='pass');if(pass)submit(pass);};
  scene.cancelTarget=()=>{scene.pendingTargets=null;scene.selectedSeq=null;renderHand();};
  scene.open=()=>{document.body.classList.add("in-battle");ui.hidden=false;log.innerHTML='';result.hidden=true;addLog(`遭遇 ${enc.templates.map(m=>m.name).join('、')}！`,0);renderHand();};
  scene.close=()=>{document.body.classList.remove("in-battle");ui.hidden=true;result.hidden=true;};
  $('#battle-pass').onclick=()=>scene.pass();
  $('#battle-flee').onclick=()=>{if(!scene.done)onFlee();};
  return scene;
}
