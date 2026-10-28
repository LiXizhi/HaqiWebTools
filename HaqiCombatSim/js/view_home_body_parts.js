import {DetailDialog} from './view_detail_dialog.js';
import {createRng,hashSeed} from './rng_core.js';

// Presentation only. The caller owns the request, valid object identity and receipt.
export function openHomeBodyParts(parent,{diagram,assetMode='cdn',group='face',onChoose,valid=()=>true,request='',onReplay=null,seed='',focusPart=null}){
 const el=(tag,cls='',...children)=>{const node=document.createElement(tag);node.className=cls;node.append(...children);return node;};
 const dialog=new DetailDialog(parent,{el,title:'看看纸上朋友',className:'equipment-item-dialog home-body-parts-dialog'});
 dialog.dialog.style.cssText='width:min(540px,calc(100vw - 24px));max-height:90vh;box-sizing:border-box;overflow:auto';
 const intro=el('p','',focusPart?'看看问号连线指的位置。看清楚后，按问号返回告诉伙伴它的名字。':'沿着圆点的线找到图上的位置，再选它的编号。'),status=el('p'),frame=el('div'),tabs=el('div');
 status.setAttribute('role','status');frame.style.cssText='position:relative;width:100%;background:var(--paper,#fff8df);overflow:hidden';
 tabs.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 let loaded=false,dead=false,currentGroup=group;
 const button=(text,fn)=>{const b=el('button','secondary',text);b.type='button';b.onclick=fn;return b;};
 const svgNode=(name,attrs)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
 const pins={face:[[.12,.08],[.10,.43],[.10,.86],[.89,.53],[.89,.88]],body:[[.12,.35],[.10,.64],[.12,.80],[.82,.92]]};
 const source=new URL(assetMode==='local'?diagram.image.local:diagram.image.cdn,new URL('../',import.meta.url)).href;
 function render(){
  if(dead)return;frame.replaceChildren();
  const [x,y,w,h]=diagram.groups[currentGroup].viewBox,ratio=w*diagram.image.width/(h*diagram.image.height);
  frame.style.aspectRatio=String(ratio);
  const picture=svgNode('svg',{viewBox:`${x*diagram.image.width} ${y*diagram.image.height} ${w*diagram.image.width} ${h*diagram.image.height}`,width:'100%',height:'100%','aria-hidden':'true'});picture.style.cssText='position:absolute;inset:0';
  if(loaded)picture.append(svgNode('image',{href:source,width:diagram.image.width,height:diagram.image.height}));
  const lines=svgNode('svg',{viewBox:'0 0 100 100',preserveAspectRatio:'none',width:'100%',height:'100%','aria-hidden':'true'});lines.style.cssText='position:absolute;inset:0;pointer-events:none';
  frame.append(picture,lines);
  diagram.parts.filter(p=>p.group===currentGroup).forEach((part,i)=>{
   if(focusPart&&part.id!==focusPart)return;
   const numbers=Array.from({length:pins[currentGroup].length},(_,n)=>n+1);if(seed)createRng(hashSeed(seed+currentGroup)).shuffle(numbers);
   const [px,py]=pins[currentGroup][i],ax=(part.anchor[0]-x)/w,ay=(part.anchor[1]-y)/h;
   lines.append(svgNode('line',{x1:px*100,y1:py*100,x2:ax*100,y2:ay*100,stroke:'#24533d','stroke-width':.55,'vector-effect':'non-scaling-stroke'}),svgNode('circle',{cx:ax*100,cy:ay*100,r:1.05,fill:'#fff8df',stroke:'#24533d','stroke-width':.4}));
   const b=button(focusPart?'?':String(numbers[i]),()=>{if(!loaded||dead||!valid())return;onChoose(part.id);});
   b.className='home-body-pin';b.dataset.bodyPart=part.id;b.setAttribute('aria-label',`图中位置 ${numbers[i]}`);b.disabled=!loaded;b.style.cssText=`position:absolute;left:${px*100}%;top:${py*100}%;transform:translate(-50%,-50%);width:44px;height:44px;min-width:44px;padding:0;border-radius:50%;font-weight:bold;background:#fff8df;color:#244f3b;border:2px solid #9c7d3b;box-shadow:0 1px 3px #0003`;
   frame.append(b);
   if(focusPart)b.setAttribute('aria-label','看清楚了，返回回答');
  });
 }
 if(!focusPart)for(const [id,label] of [['face','放大脸部'],['body','看全身']])tabs.append(button(label,()=>{currentGroup=id;render();}));
 const image=new Image();image.crossOrigin='anonymous';
 async function load(){status.textContent='正在展开角色画…';try{image.src=source;await image.decode();if(dead)return;if(!valid()){dialog.destroy();return;}loaded=true;status.textContent='';render();}catch{if(dead)return;status.textContent='角色画暂时没有加载，请重试。';loaded=false;render();}}
 const retry=button('重新加载角色画',()=>void load());dialog.body.append(intro);if(request)dialog.body.append(el('p','',request));if(onReplay)dialog.body.append(button('再听一次',()=>{if(valid()&&!dead)void onReplay();}));dialog.body.append(tabs,frame,status,retry);
 const destroy=dialog.destroy.bind(dialog);dialog.destroy=()=>{dead=true;destroy();};dialog.dialog.addEventListener('close',()=>{dead=true;});
 render();dialog.open();void load();return dialog;
}
