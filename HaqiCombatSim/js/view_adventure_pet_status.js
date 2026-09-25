import {petMaxHp, petParams, petStage, STAGE_NAMES} from './adventure_pets_core.js';

function fillStatus(node,pet,content) {
 const max=petMaxHp(pet,content);
 for(const meter of node.children){
  const hunger=meter.dataset.petMeter==='hunger';
  const value=hunger?pet.hunger:pet.hp,limit=hunger?100:max;
  meter.max=limit;meter.value=Math.max(0,Math.min(limit,value));
  const label=`${hunger?'饱食':'生命'} ${Math.floor(value)} / ${limit}`;
  meter.title=label;meter.setAttribute('aria-label',label);
 }
}

export function createPetStatus(pet,content,el) {
 const node=el('span','pet-head-status');node.dataset.petStatus=pet.speciesId;
 for(const kind of ['hp','hunger']){
  const meter=el('progress',`pet-meter pet-meter-${kind}`);meter.dataset.petMeter=kind;node.append(meter);
 }
 fillStatus(node,pet,content);return node;
}

export function updatePetStatus(root,save,content) {
 for(const node of root.querySelectorAll('[data-pet-status]')){
  const pet=save.pets[node.dataset.petStatus];if(pet)fillStatus(node,pet,content);
 }
}

export function createPetEvolution(assets,id,pet,portrait,el) {
 const p=petParams(assets.content),current=pet?petStage(pet.level,assets.content):-1;
 const path=el('div','pet-growth-stages');path.setAttribute('aria-label','四阶段进化路径');
 for(let index=0;index<4;index++){
  const locked=!!pet&&pet.level<p.stageLevels[index];
  const stage=el('section',`pet-growth-stage${locked?' is-locked':''}${current===index?' is-current':''}`,
   portrait(assets,id,index,96),el('h3','',STAGE_NAMES[index]),
   el('p','muted',`${p.stageLevels[index]}级${locked?'解锁':''} · 卡包 ${p.petCapacities[index]} 张`),
   el('small','pet-growth-state',current===index?'当前形态':locked?'未解锁':pet?'已解锁':'进化形态'));
  if(current===index)stage.setAttribute('aria-current','step');
  path.append(stage);
 }
 return path;
}
