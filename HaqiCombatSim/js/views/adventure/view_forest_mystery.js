import {el,button} from './primitives.js';
import {forestMysteryStage,forestMysteryOrderCorrect,FOREST_MYSTERY_EVENTS,FOREST_MYSTERY_OBSERVATIONS} from '../../forest_mystery_core.js';

export function renderForestMysteryJournal(body,m){
 const notes=el('details','forest-help');notes.append(el('summary','',`调查袋 · ${m.observed.length}/4 件物证`));
 for(const id of m.observed){const row=FOREST_MYSTERY_OBSERVATIONS[id];notes.append(el('p','',el('strong','',row.name+'：'),row.text));}
 if(m.witness)notes.append(el('p','','莫尼的证词：灯暗了，先出门查看；回程捡到草地上的靴子，放回帐篷。补给单也淋湿了。他以为放回去就好了，没有说一声。'));
 if(m.status==='solved')notes.append(el('p','','核对后的经过：巡夜灯变暗 → 莫尼出门查看 → 回程捡到靴子 → 放回帐篷，没有通知茜茜。'));
 body.append(notes);
}

// Reuses camp landmarks and shipped prop art; every persisted discovery still
// goes through the commission transaction and its distance checks.
export function renderForestMystery(body,actions,model,cb,illustration){
 const {save,assets,nearby}=model,m=save.forestCommission.mystery,stage=forestMysteryStage(save);
 const status=el('p','forest-status');status.setAttribute('role','status');
 body.append(el('h3','','草屑和脚印'),el('p','',m.route==='tracks'?'你们决定从靴底的草屑追起。':'你们决定先检查巡夜灯，再回头找补给留下的痕迹。'));
 renderForestMysteryJournal(body,m);
 if(!nearby){
  body.append(el('p','','先走到现场。找到的物证会留在调查袋里。'));
  actions.append(button('带我去调查地点',cb.go,'primary'));
 }else if(['tent','desk'].includes(stage)){
  body.append(el('p','',stage==='tent'?'帐篷里的东西是干的，帐篷外却留着泥和碎草。点开物件仔细看看。':'灯又亮了。沿着灯边的草地，看看脚印来回走向哪里。'));
  const scene=el('div','forest-mystery-scene');
  scene.append(stage==='tent'?illustration(assets,'buildingArt','camp','tent',320,180):illustration(assets,'environmentArt','forestQuest','patrolLantern',106,132));
  const objects=el('div','forest-mystery-objects');
  for(const [id,label] of stage==='tent'?[['grass','查看泥里的草屑'],['paper','翻看湿补给单'],['hat','看看干帽子']]:[['tracks','沿着脚印观察'],['lamp','检查灯柄'],['bush','翻看灌木叶下']]){
   const found=m.observed.includes(id);
   const inspect=button(found?'已记录 · '+label:label,()=>cb.action({step:'mystery-inspect',object:id}),'secondary');
   inspect.setAttribute('aria-pressed',String(found));objects.append(inspect);
  }
  scene.append(objects);body.append(scene);
 }else if(stage==='witness'){
  body.append(el('p','forest-plan-reply','莫尼看了看你找到的草屑：“这是从那片湿草地带回来的。你想知道我为什么去过那里吗？”'));
  actions.append(button('拿出物证，问问经过',()=>cb.action({step:'mystery-question'}),'primary'));
 }else{
  body.append(el('p','','茜茜把三张经过卡放到桌上：“先后顺序弄清楚，就知道补给为什么没在原处了。你来排，我来记。”'));
  const order=FOREST_MYSTERY_EVENTS.map(row=>row.id),list=el('ol','forest-mystery-order');
  const describe=id=>FOREST_MYSTERY_EVENTS.find(row=>row.id===id).text;
  const draw=()=>{
   list.replaceChildren();
   order.forEach((id,index)=>{
    const row=el('li','',el('span','',describe(id))),controls=el('div','forest-mystery-move');
    for(const [delta,label] of [[-1,'往前移'],[1,'往后移']]){
     const move=button(label,()=>{
      const next=index+delta;if(next<0||next>=order.length)return;
      [order[index],order[next]]=[order[next],order[index]];draw();
      status.textContent=`已把“${describe(id)}”移到第 ${next+1} 步。`;
      list.children[next]?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
     },'secondary');
     move.disabled=index+delta<0||index+delta>=order.length;move.setAttribute('aria-label',`${describe(id)}，${label}`);controls.append(move);
    }
    row.append(controls);list.append(row);
   });
  };draw();body.append(list);
  const help=el('details','forest-help');help.append(el('summary','','再听一遍莫尼的证词'),el('p','','“灯一暗，我先去查看。回程看见靴子掉在草地上，就捡回帐篷。补给单也淋湿了。”'));body.append(help);
  const endings=el('div','forest-mystery-endings'),choices=[];let ending=null,busy=false;
  const submit=button('把经过讲给茜茜听',()=>{
   if(!ending||busy)return;
   if(!forestMysteryOrderCorrect(order)){status.textContent='茜茜：莫尼先去查看灯，回程才看见草地上的靴子。把这两步挪到前面，再试一次。';return;}
   busy=true;submit.disabled=true;
   let pending;try{pending=cb.action({step:'mystery-solve',order:[...order],ending});}catch(error){pending=Promise.reject(error);}
   Promise.resolve(pending).then(result=>{if(result===false)status.textContent='这次经过没有保存，可以重试。';}).catch(()=>{status.textContent='这次经过没有保存，可以重试。';}).finally(()=>{busy=false;submit.disabled=!ending;});
  },'primary');submit.disabled=true;
  body.append(el('p','','以后送补给，你们准备怎么做？'));
  for(const [id,label] of [['sign','移动补给后，留下位置便签'],['pair','结伴送达，当面告诉对方']]){
   const choice=button(label,()=>{ending=id;for(const row of choices)row.node.setAttribute('aria-pressed',String(row.id===id));submit.disabled=busy;},'secondary');choice.setAttribute('aria-pressed','false');choices.push({id,node:choice});endings.append(choice);
  }
  body.append(endings);actions.append(submit);
 }
 body.append(status);actions.append(button('先收好调查袋',()=>cb.action({step:'mystery-pause'}),'secondary'));
}
