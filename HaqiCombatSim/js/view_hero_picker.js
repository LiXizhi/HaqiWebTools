import {heroPortrait} from './hero_renderer.js';
import {tr} from './locale_runtime.js';

// Independent carousels retain each gender's last choice without touching saves.
export function createHeroPicker(assets,draft){
 const root=document.createElement('div');root.className='avatar-choice';
 const cards=[];draft.headChoices||={};
 if(draft.headId)draft.headChoices[draft.appearance]=draft.headId;
 function select(value,id){draft.appearance=value;draft.headId=id;draft.headChoices[value]=id;
  for(const card of cards){const on=card.value===value;card.node.classList.toggle('selected',on);card.select.setAttribute('aria-pressed',String(on));}
 }
 for(const [value,gender,label] of [['boy','male','魔法少年'],['girl','female','魔法少女']]){
  const entries=Object.entries(assets.hero?.manifest.heads||{}).filter(([,h])=>h.gender===gender);
  if(!entries.length)entries.push([gender==='male'?'elf-boy':'elf-girl',{name:label}]);
  let index=Math.max(0,entries.findIndex(([id])=>id===draft.headChoices[value])),suppressClick=false,start=null;
  const card=document.createElement('div');card.className='avatar-option avatar-carousel';card.dataset.appearance=value;
  const pick=document.createElement('button');pick.type='button';pick.className='avatar-select';
  const picture=document.createElement('span');picture.className='avatar-picture';
  const caption=document.createElement('span'),counter=document.createElement('span');counter.className='avatar-counter';counter.setAttribute('aria-live','polite');
  pick.append(picture,caption,counter);pick.onclick=()=>{if(suppressClick){suppressClick=false;return;}select(value,entries[index][0]);};
  function paint(){const [id,head]=entries[index];draft.headChoices[value]=id;picture.replaceChildren(heroPortrait(assets,{appearance:value,headId:id},90,95));caption.textContent=tr(head.name||label);counter.textContent=`${index+1} / ${entries.length}`;pick.setAttribute('aria-label',`${tr(label)} · ${tr(head.name||label)} · ${index+1}/${entries.length}`);}
  function turn(delta){index=(index+delta+entries.length)%entries.length;paint();select(value,entries[index][0]);}
  const arrow=(delta,name)=>{const b=document.createElement('button');b.type='button';b.className='avatar-page';b.textContent=delta<0?'‹':'›';b.setAttribute('aria-label',`${tr(label)} · ${tr(name)}`);b.disabled=entries.length<2;b.onclick=()=>turn(delta);return b;};
  card.append(arrow(-1,'上一个形象'),pick,arrow(1,'下一个形象'));
  pick.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();turn(e.key==='ArrowLeft'?-1:1);}};
  pick.onpointerdown=e=>{if(e.button!==0||e.isPrimary===false)return;suppressClick=false;start={x:e.clientX,y:e.clientY,id:e.pointerId};pick.setPointerCapture?.(e.pointerId);};
  pick.onpointerup=e=>{if(!start||start.id!==e.pointerId)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;if(Math.abs(dx)>=30&&Math.abs(dx)>Math.abs(dy)*1.4){suppressClick=true;turn(dx<0?1:-1);}};
  pick.onpointercancel=()=>{start=null;};pick.onlostpointercapture=()=>{start=null;};
  cards.push({value,node:card,select:pick});root.append(card);paint();
 }
 select(draft.appearance||'boy',draft.headChoices[draft.appearance||'boy']);return root;
}
