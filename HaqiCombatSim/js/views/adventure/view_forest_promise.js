import {el,button} from './primitives.js';
import {setText} from '../../locale_runtime.js';

// A small scene at existing camp locations, rather than a second quest list.
export function renderForestPromise(body,actions,model,cb,illustration,status){
 const {save,assets,nearby}=model,m=save.forestCommission.mystery,p=m.promise;
 let busy=false;const controls=[],active=()=>cb.isActive?.()!==false;
 const act=(label,value,style='primary',parent=actions)=>{
  const node=button(label,()=>{
   if(busy||!active())return;
   busy=true;for(const control of controls)control.disabled=true;
   let pending;try{pending=cb.action(value);}catch(error){pending=Promise.reject(error);}
   Promise.resolve(pending).then(result=>{
    if(!active())return;
    if(result===false)setText(status,'这次约定没有保存，可以重试。');
    else if(result?.message)setText(status,result.message);
   }).catch(()=>{if(active())setText(status,'这次约定没有保存，可以重试。');}).finally(()=>{
    busy=false;if(active())for(const control of controls)control.disabled=false;
   });
  },style);controls.push(node);parent.append(node);
 };
 body.append(el('h3','','把约定用一次'),setText(el('p','forest-next-goal'),'营地回访 · {current}/2',{current:p.stage==='confirm'?2:1}));
 body.append(el('p','',m.ending==='sign'?'备用灯芯已经收进补给帐篷。这次，留给不在场的人一条能照着找到的位置消息。':'莫尼和茜茜说好了结伴出发。这次先问清，再等对方回应；不用抢着替谁答应。'));
 if(!nearby){
  body.append(el('p','','走到约好的地方再继续。已经写下或说清的内容会保留。'));
  actions.append(button('带我去落实约定',cb.go,'primary'));
 }else if(p.stage==='mark'){
  const scene=el('div','forest-mystery-scene');
  scene.append(illustration(assets,'buildingArt','camp','tent',320,180),el('p','forest-promise-note','帐篷入口有一张空便签。要让没看见刚才那一幕的人也能找到灯芯，该写哪一句？'));
  body.append(scene);
  const choices=el('div','forest-promise-choices');body.append(choices);
  act('写：备用灯芯已经收好了',{step:'promise-mark',place:'vague'},'secondary',choices);
  act('写：备用灯芯在补给帐篷里',{step:'promise-mark',place:'tent'},'secondary',choices);
 }else if(p.stage==='invite'){
  body.append(el('blockquote','forest-promise-speech','莫尼：我这边已经备好了。茜茜那边呢？你有听见她说准备好了吗？'));
  const choices=el('div','forest-promise-choices');body.append(choices);
  act('去问茜茜，听她自己回应',{step:'promise-invite',response:'ask'},'secondary',choices);
  act('替茜茜说：她肯定准备好了',{step:'promise-invite',response:'answer-for'},'secondary',choices);
 }else{
  body.append(el('blockquote','forest-promise-speech',m.ending==='sign'?'莫尼看见了便签。问问他会去哪里找，看看你留下的消息有没有说清。':'茜茜听见你回来问她，抬起了头。先等她回应，再确认大家是否都准备好了。'));
  act(m.ending==='sign'?'请莫尼读回便签的位置':'等茜茜回应，再确认出发',{step:'promise-confirm'});
 }
 act('这次先记下，稍后继续',{step:'promise-pause'},'secondary');
}
