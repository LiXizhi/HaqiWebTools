import {heroPortrait} from './hero_renderer.js';
import {resolvedBodyId,PICKER_HEAD_EXCLUDE} from './hero_body_core.js';
import {tr} from './locale_runtime.js';

const activePickers=new WeakMap();
// Independently remember each gender's head and body without mutating a save.
export function createHeroPicker(assets,draft,existingRoot=null){
 const root=existingRoot||document.createElement('div');if(existingRoot)root.replaceChildren();root.className='avatar-choice';
 activePickers.set(draft,root);
 const cards=[];draft.headChoices||={};draft.bodyChoices||={};
 draft.customHeadChoices||={};
 if(draft.customHead){draft.customHeadChoices[draft.appearance]=draft.customHead;assets.hero?.registerHead?.(draft.customHead);}
 if(draft.headId)draft.headChoices[draft.appearance]=draft.headId;
 draft.bodyChoices[draft.appearance||'boy']=resolvedBodyId(draft);
 function select(value){
  draft.appearance=value;draft.headId=draft.headChoices[value];draft.bodyId=draft.bodyChoices[value];
  draft.customHead=draft.customHeadChoices[value]?.id===draft.headId?draft.customHeadChoices[value]:undefined;
  for(const card of cards){const on=card.value===value;card.node.classList.toggle('selected',on);card.select.setAttribute('aria-pressed',String(on));}
  root.dispatchEvent(new Event('change',{bubbles:true}));
 }
 for(const [value,gender,label] of [['boy','male','男主角'],['girl','female','女主角']]){
  const fallback=gender==='male'?'elf-boy':'elf-girl';
  // 主角换装不枚举都市居民头/身：短发职业头配经典裙装会被看成「男生头挂女生模板」。
  const heads=Object.entries(assets.hero?.manifest.heads||{}).filter(([id,h])=>h.gender===gender&&!PICKER_HEAD_EXCLUDE.test(id));
  const custom=draft.customHeadChoices[value];if(custom&&!heads.some(([id])=>id===custom.id))heads.push([custom.id,custom]);
  if(!heads.length)heads.push([fallback,{name:label}]);
  const bodies=[[gender,{name:'经典蓝金'}],...Object.entries(assets.hero?.manifest.bodyVariants||{}).filter(([,b])=>b.gender===gender&&!b.recommendedHeadId)];
  let headIndex=heads.findIndex(([id])=>id===draft.headChoices[value]);
  let bodyIndex=bodies.findIndex(([id])=>id===draft.bodyChoices[value]);
  if(headIndex<0)headIndex=Math.max(0,heads.findIndex(([id])=>id===fallback));
  if(bodyIndex<0)bodyIndex=0;
  // 若草稿仍带都市头身（旧缓存/旧存档），回落到同性别经典形象，避免女卡露出男生短发。
  if(PICKER_HEAD_EXCLUDE.test(heads[headIndex]?.[0]||'')||PICKER_HEAD_EXCLUDE.test(draft.headChoices[value]||'')){
   headIndex=Math.max(0,heads.findIndex(([id])=>id===fallback));bodyIndex=0;
  }
  const card=document.createElement('div');card.className='avatar-option avatar-parts';card.dataset.appearance=value;
  const pick=document.createElement('button');pick.type='button';pick.className='avatar-select';
  const picture=document.createElement('span');picture.className='avatar-picture';
  const genderIcon=document.createElement('span');genderIcon.className='avatar-gender-icon';genderIcon.textContent=value==='boy'?'♂':'♀';genderIcon.setAttribute('aria-hidden','true');
  pick.append(genderIcon,picture);
  const arrows=[];
  function paint(){
   draft.headChoices[value]=heads[headIndex][0];draft.bodyChoices[value]=bodies[bodyIndex][0];
   picture.replaceChildren(heroPortrait(assets,{appearance:value,headId:heads[headIndex][0],bodyId:bodies[bodyIndex][0],customHead:custom?.id===heads[headIndex][0]?custom:undefined},96,112));
   const names={head:tr(heads[headIndex][1].name),body:tr(bodies[bodyIndex][1].name)};
   for(const {part,delta,button} of arrows)button.setAttribute('aria-label',`${tr(label)} · ${tr(part==='head'?'头部':'身体')} · ${names[part]} · ${tr(delta<0?'上一个':'下一个')}`);
   pick.setAttribute('aria-label',tr(label)+' · '+tr(heads[headIndex][1].name)+' · '+tr(bodies[bodyIndex][1].name));
  }
  function turn(part,delta){
   if(part==='head')headIndex=(headIndex+delta+heads.length)%heads.length;
   else bodyIndex=(bodyIndex+delta+bodies.length)%bodies.length;
   const head=heads[headIndex][1],bodyId=bodies[bodyIndex][0],body=assets.hero?.manifest.bodyVariants?.[bodyId];
   // 生成套装头身成对：改头跟推荐身体，改身体跟推荐头，避免都市短发挂到经典裙装。
   if(part==='head'&&head.recommendedBodyId){
    const paired=bodies.findIndex(([id])=>id===head.recommendedBodyId);if(paired>=0)bodyIndex=paired;
   }else if(part==='body'&&body?.recommendedHeadId){
    const paired=heads.findIndex(([id])=>id===body.recommendedHeadId);if(paired>=0)headIndex=paired;
   }
   paint();select(value);
  }
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
 const genderHint=document.createElement('p');genderHint.className='avatar-gender-hint';genderHint.textContent=tr('先选男生或女生');root.append(genderHint);
 if(assets.photoHeads){
  const photo=document.createElement('button');photo.type='button';photo.className='secondary avatar-photo-entry';photo.textContent=tr('用我的照片生成');
  photo.setAttribute('aria-haspopup','dialog');
  photo.onclick=()=>assets.photoHeads.open(draft,(head,outfit)=>{
   // Always write the shared draft first; the picker node may have been rebuilt while the popup was open.
   draft.appearance=head.gender==='female'?'girl':'boy';
   if(outfit){draft.bodyId=outfit.bodyId;draft.bodyChoices[draft.appearance]=outfit.bodyId;}
   else draft.bodyId=draft.bodyChoices[draft.appearance];
   draft.headId=head.id;draft.customHead=head;draft.headChoices[draft.appearance]=head.id;draft.customHeadChoices[draft.appearance]=head;
   const currentRoot=activePickers.get(draft);
   if(!currentRoot?.isConnected)return;
   createHeroPicker(assets,draft,currentRoot);
  });const actions=document.createElement('div');actions.className='avatar-photo-actions';actions.append(photo);root.append(actions);
 }
 select(draft.appearance||'boy');return root;
}
