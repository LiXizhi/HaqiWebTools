import {DetailDialog} from './view_detail_dialog.js';
export function openBuildingProperties(parent,{el,button,obj,item,save}){
 const dialog=new DetailDialog(parent,{el,title:'物品属性',className:'equipment-item-dialog'}),form=el('form','home-building-properties');
 const defaults=item.building?.obstruction||{enabled:item.layer==='solid',width:item.size[0],depth:item.size[1],offsetX:0,offsetY:0};
 const p={snap:item.building?.snap??false,...defaults,...obj.properties},fields={};
 for(const [key,label] of [['snap','吸附网格'],['enabled','阻挡通行'],['width','阻挡宽度'],['depth','阻挡深度'],['offsetX','横向偏移'],['offsetY','纵向偏移']]){
  const row=el('label','',label),input=el('input');input.type=['snap','enabled'].includes(key)?'checkbox':'number';input.setAttribute('aria-label',label);
  if(input.type==='checkbox')input.checked=p[key];else{input.value=p[key];input.step='.01';input.min=key.startsWith('offset')?'-8':'.05';input.max='8';input.required=true;}
  fields[key]=input;row.append(input);form.append(row);
 }
 if(!item.building){
  const row=el('label','','摆放位置'),input=el('select');input.setAttribute('aria-label','摆放位置');
  input.append(new Option('地面／室内','ground'),new Option('屋顶（随屋顶隐藏）','roof'));input.value=obj.properties?.surface||'ground';fields.surface=input;row.append(input);form.append(row);
 }
 const message=el('p','');form.append(message);
 const apply=button('保存属性',()=>{});apply.type='submit';
 form.onsubmit=async e=>{e.preventDefault();try{await save(Object.fromEntries(Object.entries(fields).map(([k,i])=>[k,k==='surface'?i.value:i.type==='checkbox'?i.checked:Number(i.value)])));dialog.destroy();}catch(e){message.textContent=e.message;}};
 form.append(apply,button('恢复默认',async()=>{try{await save(undefined);dialog.destroy();}catch(e){message.textContent=e.message;}}));
 dialog.body.append(form);dialog.open();return dialog;
}
