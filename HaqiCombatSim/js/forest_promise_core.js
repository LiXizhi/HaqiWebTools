// An optional, reward-free visit after the investigation. The chosen ending
// becomes a nearby action; old completed investigations remain completed.
const check=(ok,message)=>{if(!ok)throw Error(message);};

export function forestPromiseGoal(save){
 const m=save.forestCommission?.mystery,p=m?.promise;
 if(p?.status!=='active')return null;
 if(p.stage==='mark')return {id:'forest-supplies-tent',kind:'landmark',label:'到补给帐篷留下清楚的位置便签',hint:'备用灯芯已经收进帐篷。便签要让没在场的人也能找到。'};
 if(p.stage==='invite')return {id:36201,kind:'npc',label:'和莫尼当面确认出发约定',hint:'先问清同伴的准备情况，不替别人答应。'};
 return {id:m.ending==='sign'?36201:36200,kind:'npc',label:m.ending==='sign'?'请莫尼照着便签找补给':'向茜茜确认，等得到回应再出发',hint:'让对方说出收到的消息，才能知道这一次有没有说清。'};
}

export function applyForestPromise(save,action,nearby){
 const m=save.forestCommission?.mystery;
 check(save.forestCommission?.phase==='done'&&m?.status==='solved','先查清补给的经过，再试试你们的新约定。');
 if(action.step==='promise-start'){
  nearby(36200,'npc');
  if(m.promise?.status==='done')return {changed:false,message:'这次约定已经用过了，营地里的人都记得。'};
  if(m.promise?.status==='active')return {changed:false,message:'约定还在继续，按眼前的提醒去找同伴。'};
  if(m.promise)m.promise.status='active';
  else m.promise={version:1,status:'active',stage:m.ending==='sign'?'mark':'invite'};
  return {message:m.ending==='sign'?'茜茜：备用灯芯收在帐篷里了。这次留张写清位置的便签，请莫尼照着找找看。':'茜茜：新约定，先在营地试一次。去问问莫尼，再回来和我确认；没有回应之前，谁都不用急着走。'};
 }
 const p=m.promise;
 check(p?.status==='active','先和茜茜约好试一次新的送达办法。');
 if(action.step==='promise-pause'){
  p.status='paused';return {message:'这次回访先记下。便签和说好的事都会保留，回来找茜茜就能继续。'};
 }
 const goal=forestPromiseGoal(save);nearby(goal.id,goal.kind);
 if(action.step==='promise-mark'){
  check(m.ending==='sign'&&p.stage==='mark','先按当前约定找到对应的地方。');
  check(['tent','vague'].includes(action.place),'先选一句准备留在便签上的话。');
  if(action.place==='vague')return {changed:false,message:'“已经收好”没有写位置。莫尼没看见刚才的事，还是不知道去哪里找。把帐篷写进去试试。'};
  p.stage='confirm';return {message:'你把“备用灯芯在补给帐篷里”压在帐篷入口。还差一步：请莫尼说说，他读到的是什么。'};
 }
 if(action.step==='promise-invite'){
  check(m.ending==='pair'&&p.stage==='invite','先按当前约定找到对应的人。');
  check(['ask','answer-for'].includes(action.response),'先选一句准备对莫尼说的话。');
  if(action.response==='answer-for')return {changed:false,message:'莫尼：谢谢你来叫我。不过茜茜有没有准备好，要听她自己说。我们等她回一句再走。'};
  p.stage='confirm';return {message:'莫尼：我这边准备好了。你去问问茜茜，我会等她回应。这一次，不让谁追着背影跑。'};
 }
 if(action.step==='promise-confirm'){
  check(p.stage==='confirm','先把位置写清，或和莫尼问清约定。');
  p.status='done';
  return {completed:true,message:m.ending==='sign'?'莫尼：便签写着补给帐篷，我照着找到了灯芯。这回不用猜了。你们留下的不只是一张纸，还有一句说清楚的话。':'茜茜：我也准备好了。谢谢你回来问我。莫尼听见回应，才放下心来；这次大家都知道，出发前要先等齐。'};
 }
 throw Error('未知营地约定操作');
}

export function validateForestPromise(m){
 const p=m.promise;if(p===undefined)return;
 check(m.status==='solved'&&p&&typeof p==='object'&&!Array.isArray(p)&&p.version===1&&['active','paused','done'].includes(p.status),'营地约定记录无效');
 check(Object.keys(p).every(k=>['version','status','stage'].includes(k)),'营地约定包含未知字段');
 const first=m.ending==='sign'?'mark':'invite';
 check([first,'confirm'].includes(p.stage)&&(p.status!=='done'||p.stage==='confirm'),'营地约定进度无效');
}
