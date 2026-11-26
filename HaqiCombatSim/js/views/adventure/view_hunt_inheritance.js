import {HUNT_EQUIPMENT,huntParams,huntInheritanceQuote} from '../../adventure_hunt_core.js';
import {equipmentInstances} from '../../adventure_equipment_instances_core.js';

export function renderHuntInheritance(body,model,cb,{el,button}){
 const {save,assets}=model,c=assets.content;
 const box=el('details','hunt-inheritance',el('summary','','换装时继承强化'));
 box.append(el('p','',`仅限三款余烬珍品帽。花费 ${huntParams(c).inheritanceFee} 奇豆，旧帽归零，新帽接收全部强化等级；不返还材料。两件装备和各自宝石保留。`));
 const rows=equipmentInstances(save,c).rows.filter(row=>HUNT_EQUIPMENT.includes(row.gsid));
 const sources=rows.filter(row=>row.serverdata.addlel>0&&!Object.values(save.equipmentGuids||{}).includes(row.guid));
 const targets=rows.filter(row=>!row.serverdata.addlel);
 if(!sources.length||!targets.length){
  box.append(el('p','muted','需要一件未穿戴的强化旧帽，以及另一款尚未强化的新帽。若旧帽正在穿戴，请先去装备详情换上新帽。'));body.append(box);return;
 }
 const source=el('select',''),target=el('select','');
 for(const [select,list] of [[source,sources],[target,targets]]){
  const counts={};
  for(const row of list){const number=counts[row.gsid]=(counts[row.gsid]||0)+1;const option=el('option','',`${c.items[row.gsid].name} +${row.serverdata.addlel} · 第${number}件`);option.value=row.guid;select.append(option);}
  select.value=list[0].guid;
 }
 // A duplicate of the old hat may sort before the other models in the bag.
 // Start with a usable model pair instead of presenting an avoidable error.
 target.value=(targets.find(row=>row.gsid!==sources[0].gsid)||targets[0]).guid;
 source.disabled=target.disabled=!!save.pendingEncounter;
 const choices=el('div','hunt-inheritance-choices',el('label','','转出强化的旧帽',source),el('label','','接收强化的新帽',target));
 const preview=el('p','hunt-inheritance-preview');preview.setAttribute('aria-live','polite');
 const confirm=button('确认转移强化',()=>cb.action({type:'hunt-forge',op:'inherit',sourceGuid:source.value,targetGuid:target.value}),'secondary');
 const refresh=()=>{
  const q=huntInheritanceQuote(save,c,source.value,target.value);confirm.disabled=!q.allowed;
  preview.textContent=q.allowed?`确认后：${c.items[q.source.gsid].name} +0 → ${c.items[q.target.gsid].name} +${q.level}；扣除 ${q.fee} 奇豆，剩余 ${(save.inventory[100]||0)-q.fee}。`:q.reason;
 };
 source.addEventListener('change',refresh);target.addEventListener('change',refresh);refresh();
 box.append(choices,preview,confirm);body.append(box);
}
