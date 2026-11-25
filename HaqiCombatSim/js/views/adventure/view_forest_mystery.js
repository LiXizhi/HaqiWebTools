import {el,button} from './primitives.js';
import {fill,setText} from '../../locale_runtime.js';
import {forestMysteryStage,forestMysteryOrderFeedback,FOREST_MYSTERY_EVENTS,FOREST_MYSTERY_OBSERVATIONS,FOREST_MYSTERY_QUESTIONS,FOREST_MYSTERY_REASONING} from '../../forest_mystery_core.js';

export function renderForestMysteryJournal(body,m){
 const notes=el('details','forest-help');notes.append(setText(el('summary'),'调查袋 · {count}/4 件物证',{count:m.observed.length}));
 for(const id of m.observed){const row=FOREST_MYSTERY_OBSERVATIONS[id];notes.append(el('p','',setText(el('strong'),'{name}：',{name:row.name}),row.text));}
 if(m.witness)notes.append(el('p','','莫尼的证词：灯暗了，先出门查看；回程捡到草地上的靴子，放回帐篷。补给单也淋湿了。他以为放回去就好了，没有说一声。'));
 if(m.status==='solved')notes.append(el('p','','核对后的经过：巡夜灯变暗 → 莫尼出门查看 → 回程捡到靴子 → 放回帐篷，没有通知茜茜。'));
 body.append(notes);
}

// Reuses camp landmarks and shipped prop art; every persisted discovery still
// goes through the commission transaction and its distance checks.
export function renderForestMystery(body,actions,model,cb,illustration){
 const {save,assets,nearby}=model,m=save.forestCommission.mystery,stage=forestMysteryStage(save);
 const status=el('p','forest-status');status.setAttribute('role','status');
 let busy=false;const active=()=>cb.isActive?.()!==false;
 const request=(value,failure='这一步没有保存，可以重试。')=>{
  if(busy||!active())return;busy=true;
  const controls=[...body.querySelectorAll('button'),...actions.querySelectorAll('button')];
  const disabled=controls.map(node=>node.disabled);for(const node of controls)node.disabled=true;
  let pending;try{pending=cb.action(value);}catch(error){pending=Promise.reject(error);}
  return Promise.resolve(pending).then(result=>{
   if(!active())return;
   if(result===false)setText(status,failure);
   else if(result?.changed===false&&result.message)setText(status,result.message);
  }).catch(()=>{if(active())setText(status,failure);}).finally(()=>{busy=false;if(active())controls.forEach((node,index)=>{node.disabled=disabled[index];});});
 };
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
   const inspect=button(label,()=>request({step:'mystery-inspect',object:id}),'secondary');
   if(found)setText(inspect,'已记录 · {label}',{label});
   inspect.setAttribute('aria-pressed',String(found));objects.append(inspect);
  }
  scene.append(objects);body.append(scene);
 }else if(stage==='witness'){
  body.append(el('p','forest-plan-reply','莫尼看了看你找到的草屑：“这是从那片湿草地带回来的。你想知道我为什么去过那里吗？”'));
  body.append(el('p','','拿一件物证问问莫尼。想清楚以后，再把他的经过记进调查袋。'));
  const questions=el('div','forest-mystery-questions'),reply=el('p','forest-mystery-reply'),choices=[];
  reply.setAttribute('role','status');
  for(const row of FOREST_MYSTERY_QUESTIONS){
   if(!m.observed.includes(row.evidence))continue;
   const choice=button(row.question,()=>{
    if(busy||!active())return;
    for(const item of choices)item.node.setAttribute('aria-pressed',String(item.id===row.evidence));
    setText(reply,row.reply);
   },'secondary');choice.setAttribute('aria-pressed','false');
   choice.append(setText(el('small','forest-mystery-evidence'),'物证：{name}',{name:FOREST_MYSTERY_OBSERVATIONS[row.evidence].name}));
   choices.push({id:row.evidence,node:choice});questions.append(choice);
  }
  body.append(questions,reply);
  actions.append(button('把莫尼的经过记下来',()=>request({step:'mystery-question'}),'primary'));
 }else{
  body.append(el('p','','茜茜把三张经过卡放到桌上：“先后顺序弄清楚，就知道补给为什么没在原处了。你来排，我来记。”'));
  const order=FOREST_MYSTERY_EVENTS.map(row=>row.id),list=el('ol','forest-mystery-order');let conflicts=[];
  const describe=id=>FOREST_MYSTERY_EVENTS.find(row=>row.id===id).text;
  const draw=()=>{
   list.replaceChildren();
   order.forEach((id,index)=>{
    const row=el('li',conflicts.includes(id)?'forest-mystery-conflict':'',el('span','',describe(id))),controls=el('div','forest-mystery-move');
    row.dataset.event=id;
    for(const [delta,label] of [[-1,'往前移'],[1,'往后移']]){
     const move=button(label,()=>{
      if(busy||!active())return;
      const next=index+delta;if(next<0||next>=order.length)return;
      [order[index],order[next]]=[order[next],order[index]];conflicts=[];draw();
      setText(status,'已把“{event}”移到第 {step} 步。',{event:describe(id),step:next+1});
      list.children[next]?.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
     },'secondary');
     move.disabled=index+delta<0||index+delta>=order.length;move.setAttribute('aria-label',fill('{event}，{action}',{event:describe(id),action:label}).text);controls.append(move);
    }
    row.append(controls);list.append(row);
   });
  };draw();body.append(list);
  const reasoning=el('details','forest-help forest-mystery-reasoning');
  reasoning.append(el('summary','','和茜茜核对物证（可选）'),el('p','','先选能支持猜想的物证，再回到经过卡。这里的讨论不会替你排列卡片。'));
  const question=el('p','forest-mystery-reasoning-question'),evidence=el('div','forest-mystery-questions'),reply=el('p','forest-mystery-reply'),next=button('再核对一个猜想',()=>{if(busy||!active()||next.hidden)return;round++;paintReasoning();(evidence.querySelector('button')||list.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});},'secondary');
  reply.setAttribute('role','status');let round=0;
  const paintReasoning=()=>{
   evidence.replaceChildren();setText(reply,'');next.hidden=true;
   if(round>=FOREST_MYSTERY_REASONING.length){setText(question,'两条猜想都核对过了。现在用物证和证词检查经过卡。');return;}
   const puzzle=FOREST_MYSTERY_REASONING[round],options=[];let answered=false;
   setText(question,puzzle.question);
   for(const id of m.observed){
    const choice=button(FOREST_MYSTERY_OBSERVATIONS[id].name,()=>{
     if(busy||!active()||answered)return;
     for(const option of options)option.node.setAttribute('aria-pressed',String(option.id===id));
     answered=id===puzzle.answer;setText(reply,answered?puzzle.reply:puzzle.retry);
     if(answered){for(const option of options)option.node.disabled=true;next.hidden=false;setText(next,round+1<FOREST_MYSTERY_REASONING.length?'再核对一个猜想':'回到经过卡');next.focus({preventScroll:true});}
    },'secondary');choice.setAttribute('aria-pressed','false');options.push({id,node:choice});evidence.append(choice);
   }
  };
  reasoning.append(question,evidence,reply,next);paintReasoning();body.append(reasoning);
  const help=el('details','forest-help');help.append(el('summary','','再看一遍莫尼的证词'),el('p','','“灯一暗，我先去查看。回程看见靴子掉在草地上，就捡回帐篷。补给单也淋湿了。”'));body.append(help);
  const endings=el('div','forest-mystery-endings'),choices=[];let ending=null;
  const submit=button('把经过讲给茜茜听',()=>{
   if(!ending||busy||!active())return;
   const feedback=forestMysteryOrderFeedback(order);
   if(!feedback.correct){conflicts=feedback.events;draw();setText(status,feedback.message);return;}
   return request({step:'mystery-solve',order:[...order],ending},'这次经过没有保存，可以重试。');
  },'primary');submit.disabled=true;
  body.append(el('p','','以后送补给，你们准备怎么做？'));
  for(const [id,label] of [['sign','移动补给后，留下位置便签'],['pair','结伴送达，当面告诉对方']]){
   const choice=button(label,()=>{if(busy||!active())return;ending=id;for(const row of choices)row.node.setAttribute('aria-pressed',String(row.id===id));submit.disabled=false;},'secondary');choice.setAttribute('aria-pressed','false');choices.push({id,node:choice});endings.append(choice);
  }
  body.append(endings);actions.append(submit);
 }
 body.append(status);actions.append(button('先收好调查袋',()=>request({step:'mystery-pause'}),'secondary'));
}
