import {treeGloss} from './language_tree_gloss_core.js';
import {createEncounterTree,defaultCamera,createProjector,chooseLearningLabels,languageTreeLabelLimit,hitLabel,fitCamera,fadeTreeLabels} from './word_tree_layout_core.js';
import {treeWordStatus,FUNCTION_WORDS} from './language_tree_core.js';
const colors={seen:'#a6b5b0',unknown:'#85b4d0',know:'#efd18a',basic:'#83c69a',mastered:'#e5c3ff'};
export function createWordTreeView(canvas,{select,selectFruit}={}){
const ctx=canvas.getContext('2d'),sprites=new Map(),atlases=[],labelFades=new Map(),wordFades=new Map(),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let glossary=new Map(),questions=[],fruits=[];
let tree={nodes:[],branches:[]},camera=defaultCamera(),target=null,width=1,height=1,dpr=1,labels=[],selected=null,projectFrame,raf=0,last=0,stats={},started=false;
const frames=[],draws=[];
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
const observer=new ResizeObserver(resize);observer.observe(canvas);
function tile(text,soft,status){const key=text+'/'+soft+'/'+status.kind;if(sprites.has(key))return sprites.get(key);const index=sprites.size,page=Math.floor(index/510),slot=index%510;if(!atlases[page]){const sheet=document.createElement('canvas');sheet.width=2040;sheet.height=2040;atlases.push(sheet);}const sheet=atlases[page],x=(slot%10)*204,y=Math.floor(slot/10)*40,c=sheet.getContext('2d');c.fillStyle=colors[status.kind];c.filter=soft?'blur(1.4px)':'none';c.font='600 20px Georgia';c.fillText(text,x+4,y+18,196);c.font='12px system-ui';if(status.showTranslation)c.fillText(treeGloss(text,glossary),x+4,y+34,196);const value={sheet,x,y};sprites.set(key,value);return value;}
function setState(records){tree=createEncounterTree(Object.values(records.words),new Set((records.questions||[]).filter(q=>!q.completed).slice(-3).map(q=>q.target)));for(const n of tree.nodes){n.status=treeWordStatus(n.word);n.entry.meaning=n.status.showTranslation?treeGloss(n.id,glossary):'';n.sharp=tile(n.id,false,n.status);n.soft=tile(n.id,true,n.status);}if(!started){resize();camera=fitCamera(tree.nodes.length?tree.nodes:tree.branches.map(b=>b.end),width,height);started=true;}if(!raf&&!document.hidden)raf=requestAnimationFrame(draw);}
function stopMotion(){target=null;}
function reset(){stopMotion();target=fitCamera(tree.nodes,width,height);}
const pointers=new Map();let down=null,moved=false,pinch=null;
const pair=()=>{const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};};
canvas.onpointerdown=e=>{stopMotion();canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});down={x:e.clientX,y:e.clientY};moved=false;if(pointers.size===2){pinch=pair();moved=true;}};
canvas.onpointermove=e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const p=pair();if(pinch){camera.zoom=Math.max(.45,Math.min(4,camera.zoom*p.d/Math.max(1,pinch.d)));camera.x+=p.x-pinch.x;camera.y+=p.y-pinch.y;}pinch=p;moved=true;}
    else if(e.shiftKey){camera.x+=dx;camera.y+=dy;}else{camera.yaw+=dx*.006;camera.pitch=Math.max(-.6,Math.min(.6,camera.pitch+dy*.003));}
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)moved=true;
};
function release(e,cancel=false){if(!cancel&&!moved&&pointers.size===1){const r=canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top,fruit=fruits.find(f=>Math.hypot(f.x-x,f.y-y)<23);const node=fruit?null:hitLabel(labels,x,y);if(fruit)selectFruit?.(fruit.question);if(node){selected=node;select?.(node.word);}}pointers.delete(e.pointerId);pinch=null;if(cancel)moved=true;}
canvas.onpointerup=e=>release(e);canvas.onpointercancel=e=>release(e,true);canvas.onlostpointercapture=e=>{pointers.delete(e.pointerId);pinch=null;};
canvas.addEventListener('wheel',e=>{e.preventDefault();stopMotion();camera.zoom=Math.max(.45,Math.min(4,camera.zoom*Math.exp(-e.deltaY*.001)));},{passive:false});
canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(e.key))return;e.preventDefault();stopMotion();
    if(e.key==='Home')reset();else if(['+','=','-'].includes(e.key))camera.zoom=Math.max(.45,Math.min(4,camera.zoom*(e.key==='-'?.9:1.1)));
    else {const dx=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:0,dy=e.key==='ArrowUp'?-1:e.key==='ArrowDown'?1:0;if(e.shiftKey){camera.x+=dx*20;camera.y+=dy*20;}else{camera.yaw+=dx*.12;camera.pitch=Math.max(-.6,Math.min(.6,camera.pitch+dy*.05));}}
};
function line(a,b,w,color){const p=projectFrame(a),q=projectFrame(b);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineWidth=Math.max(.5,w*(p.scale+q.scale)/2);ctx.strokeStyle=color;ctx.stroke();}
function wood(){
    ctx.lineCap='round';
    function curve(a,control,b,thickness,color){let previous=a;for(let s=1;s<=18;s++){const t=s/18,u=1-t,p={x:u*u*a.x+2*u*t*control.x+t*t*b.x,y:u*u*a.y+2*u*t*control.y+t*t*b.y,z:u*u*a.z+2*u*t*control.z+t*t*b.z};line(previous,p,thickness*(1-t*.86),color);previous=p;}}
    for(let i=0;i<9;i++){const a=i*2.4;curve({x:Math.sin(a)*9,y:-65,z:Math.cos(a)*9},{x:Math.sin(a)*20,y:-128,z:Math.cos(a)*20},{x:Math.sin(a)*95,y:-133,z:Math.cos(a)*65},13,'#55543b');}
    for(let i=0;i<7;i++){const a={x:Math.sin(i)*13,y:-128,z:Math.cos(i)*11},b={x:Math.sin(i+1)*10,y:70,z:Math.cos(i+1)*10};curve(a,{x:Math.sin(i+2)*23,y:-30,z:Math.cos(i+2)*18},b,15,i%2?'#615e3e':'#777049');}
    for(const b of tree.branches){const mid={x:b.end.x*.13,y:b.end.y*.9,z:b.end.z*.13};curve(b.start,mid,b.end,b.width,'#777858');
        for(let j=0;j<3;j++){const tip={x:b.end.x+Math.sin(j*2+b.end.y)*39,y:b.end.y+20+j*8,z:b.end.z+Math.cos(j*2+b.end.y)*35};curve({x:b.end.x*.64,y:b.end.y*.85,z:b.end.z*.64},b.end,tip,3,'#667c5a');}}
}

function draw(t){raf=0;if(document.hidden)return;const begin=performance.now(),dt=last?t-last:0;last=t;
if(target){let delta=0;for(const k of Object.keys(camera)){const d=target[k]-camera[k];camera[k]+=d*.09;delta+=Math.abs(d);}if(delta<.03){camera={...target};target=null;}}
ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);projectFrame=createProjector(camera,width,height);
const points=[];for(const node of tree.nodes){const p=projectFrame(node);if(p.x>-60&&p.x<width+60&&p.y>-20&&p.y<height+20)points.push({...p,node});}points.sort((a,b)=>a.depth-b.depth);
const distantWords=fadeTreeLabels(wordFades,points,t,reduced);
function words(front){for(const p of distantWords){if((p.depth>=0)!==front)continue;const s=p.depth<20?p.node.soft:p.node.sharp,scale=Math.max(.1,Math.min(.42,p.scale*.22));ctx.globalAlpha=p.alpha*(.2+.25*Math.max(0,Math.min(1,(p.depth+40)/80)));ctx.drawImage(s.sheet,s.x,s.y,204,40,p.x-102*scale,p.y-20*scale,204*scale,40*scale);}}
words(false);ctx.globalAlpha=1;wood();words(true);ctx.globalAlpha=1;ctx.font='600 20px Georgia';
const labelPoints=[...points.filter(p=>FUNCTION_WORDS.has(p.node.id)),...points.filter(p=>!FUNCTION_WORDS.has(p.node.id))];
fruits=questions.filter(q=>!q.completed&&(!q.availableAt||Date.now()>=q.availableAt)).slice(-3).map((question,i)=>{const node=tree.nodes.find(n=>n.id===question.target);if(!node)return null;const p=projectFrame(node);return {question,x:Math.max(25,Math.min(width-25,p.x+45+i*20)),y:Math.max(25,Math.min(height-25,p.y-42-i*24))};}).filter(Boolean);
const wanted=chooseLearningLabels(labelPoints.filter(p=>!fruits.some(f=>Math.abs(p.x-f.x)<80&&Math.abs(p.y-f.y)<50)),languageTreeLabelLimit(width,height),width,height,text=>Math.max(ctx.measureText(text).width,Math.min(180,treeGloss(text,glossary).length*12)),selected?.id,FUNCTION_WORDS),fading=fadeTreeLabels(labelFades,wanted,t,reduced);labels=fading.filter(p=>p.wanted&&p.alpha>.9);
for(const p of fading){const b=p.box,s=p.node.status,color=colors[s.kind];ctx.globalAlpha=p.alpha;ctx.fillStyle='#0c2c28e8';ctx.strokeStyle=color+'88';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(b.left,b.top,b.right-b.left,b.bottom-b.top,9);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.font='600 20px Georgia';ctx.fillStyle=color;ctx.fillText(p.node.id,p.x,p.y+(s.showTranslation?1:7));ctx.font='12px system-ui';ctx.fillStyle='#b7c6ac';ctx.fillText(p.node.entry.meaning,p.x,p.y+16,b.right-b.left-12);}
ctx.globalAlpha=1;for(const f of fruits){const pulse=reduced?1:1+Math.sin(t/700)*.06;ctx.save();ctx.translate(f.x,f.y);ctx.scale(pulse,pulse);ctx.shadowColor='#f0ba60';ctx.shadowBlur=12;ctx.fillStyle='#db9c43';ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#9db379';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-14);ctx.quadraticCurveTo(1,-25,10,-23);ctx.stroke();ctx.fillStyle='#fff2c2';ctx.font='bold 18px Georgia';ctx.textAlign='center';ctx.fillText('?',0,6);ctx.restore();}
ctx.globalAlpha=1;if(dt>0){frames.push(dt);draws.push(performance.now()-begin);if(frames.length>180){frames.shift();draws.shift();}}stats={total:tree.nodes.length,drawn:points.length,culled:tree.nodes.length-points.length,labels:labels.length,dpr,cacheBytes:atlases.length*2040*2040*4,frames:[...frames],draw:[...draws]};raf=requestAnimationFrame(draw);}
const visibility=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;last=0;}else if(!raf)raf=requestAnimationFrame(draw);};document.addEventListener('visibilitychange',visibility);
return {setState,reset,setQuestions(value){questions=value;},get fruits(){return fruits.map(f=>({id:f.question.id,x:f.x,y:f.y}));},setGlossary(value){glossary=value;sprites.clear();atlases.length=0;},get camera(){return {...camera};},get stats(){return stats;},get hits(){return labels.map(p=>({id:p.node.id,meaning:p.node.entry.meaning,x:p.x,y:p.y}));},dispose(){observer.disconnect();cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);}};
}
