import {heroPortrait} from './hero_renderer.js';
import {resolvedBodyId} from './hero_body_core.js';
import {tr} from './locale_runtime.js';

// Independently remember each gender's head and body without mutating a save.
export function createHeroPicker(assets,draft){
 const root=document.createElement('div');root.className='avatar-choice';
 const cards=[];draft.headChoices||={};draft.bodyChoices||={};
 if(draft.headId)draft.headChoices[draft.appearance]=draft.headId;
 draft.bodyChoices[draft.appearance||'boy']=resolvedBodyId(draft);
 function select(value){
  draft.appearance=value;draft.headId=draft.headChoices[value];draft.bodyId=draft.bodyChoices[value];
  for(const card of cards){const on=card.value===value;card.node.classList.toggle('selected',on);card.select.setAttribute('aria-pressed',String(on));}
  root.dispatchEvent(new Event('change',{bubbles:true}));
 }
 for(const [value,gender,label] of [['boy','male','男主角'],['girl','female','女主角']]){
  const heads=Object.entries(assets.hero?.manifest.heads||{}).filter(([,h])=>h.gender===gender);
  if(!heads.length)heads.push([gender==='male'?'elf-boy':'elf-girl',{name:label}]);
  const bodies=[[gender,{name:'经典蓝金'}],...Object.entries(assets.hero?.manifest.bodyVariants||{}).filter(([,b])=>b.gender===gender)];
  let headIndex=Math.max(0,heads.findIndex(([id])=>id===draft.headChoices[value]));
  let bodyIndex=Math.max(0,bodies.findIndex(([id])=>id===draft.bodyChoices[value]));
  const card=document.createElement('div');card.className='avatar-option avatar-parts';card.dataset.appearance=value;
  const pick=document.createElement('button');pick.type='button';pick.className='avatar-select';
  const picture=document.createElement('span');picture.className='avatar-picture';
  pick.append(picture);
  const arrows=[];
  function paint(){
   draft.headChoices[value]=heads[headIndex][0];draft.bodyChoices[value]=bodies[bodyIndex][0];
   picture.replaceChildren(heroPortrait(assets,{appearance:value,headId:heads[headIndex][0],bodyId:bodies[bodyIndex][0]},96,112));
   const names={head:tr(heads[headIndex][1].name),body:tr(bodies[bodyIndex][1].name)};
   for(const {part,delta,button} of arrows)button.setAttribute('aria-label',`${tr(label)} · ${tr(part==='head'?'头部':'身体')} · ${names[part]} · ${tr(delta<0?'上一个':'下一个')}`);
   pick.setAttribute('aria-label',tr(label)+' · '+tr(heads[headIndex][1].name)+' · '+tr(bodies[bodyIndex][1].name));
  }
  function turn(part,delta){if(part==='head')headIndex=(headIndex+delta+heads.length)%heads.length;else bodyIndex=(bodyIndex+delta+bodies.length)%bodies.length;paint();select(value);}
  const arrow=(part,delta)=>{
   const button=document.createElement('button');button.type='button';button.className='avatar-page '+(delta<0?'page-prev':'page-next');button.dataset.part=part;button.textContent=delta<0?'‹':'›';
   button.onclick=()=>turn(part,delta);arrows.push({part,delta,button});return button;
  };
  card.append(pick,arrow('head',-1),arrow('head',1),arrow('body',-1),arrow('body',1));
  cards.push({value,node:card,select:pick});root.append(card);paint();
  // Tap the portrait to choose a gender; a horizontal swipe turns the part where it starts (upper half head, lower half body).
  let swipe=null,swiped=false;
  pick.onclick=()=>{if(!swiped)select(value);};
  card.onpointerdown=e=>{swiped=false;swipe=null;if(e.button===0&&!e.target.closest('.avatar-page'))swipe={x:e.clientX,y:e.clientY,id:e.pointerId};};
  card.onpointerup=e=>{if(swipe?.id!==e.pointerId)return;const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y,rect=card.getBoundingClientRect();swipe=null;
   if(Math.abs(dx)>30&&Math.abs(dx)>Math.abs(dy)*1.4){swiped=true;turn(e.clientY-rect.top<rect.height/2?'head':'body',dx<0?1:-1);}};
  card.onpointercancel=()=>swipe=null;
  // Arrow keys turn the focused part; from the portrait they turn the head.
  card.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();
   turn(e.target?.dataset?.part||'head',e.key==='ArrowLeft'?-1:1);};
 }
 select(draft.appearance||'boy');return root;
}
