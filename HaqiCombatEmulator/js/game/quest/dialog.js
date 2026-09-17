// Dialog runner for quest_list StartDialog / EndDialog / ClientDialogNPC items.
// Pages are {npcId, content, buttons:[{action,label}]}; actions: gotonext, doaccept, dofinished, donpcdialoged, close.
export function createDialogRun(pages,{kind,quest=null,npcId=null}={}) {
  if(!Array.isArray(pages)||!pages.length)throw new Error('对话内容为空');
  return {kind,quest,npcId,index:0,pages,done:false};
}
export function currentPage(run) {
  const page=run.pages[Math.min(run.index,run.pages.length-1)];
  const buttons=page.buttons.length?page.buttons:[{action:run.index<run.pages.length-1?'gotonext':'close',label:run.index<run.pages.length-1?'继续':'结束'}];
  return {...page,buttons};
}
// Returns the semantic outcome so the caller applies profile changes: {type:'next'|'accept'|'finish'|'talked'|'close'}
export function chooseButton(run,index) {
  const {buttons}=currentPage(run);
  const button=buttons[index];
  if(!button)throw new Error('无效的对话选项');
  switch(button.action) {
    case 'gotonext':
      if(run.index<run.pages.length-1){run.index++;return {type:'next'};}
      run.done=true;return {type:'close'};
    case 'doaccept':run.done=true;return {type:'accept',quest:run.quest};
    case 'dofinished':run.done=true;return {type:'finish',quest:run.quest};
    case 'donpcdialoged':run.done=true;return {type:'talked',npcId:run.npcId,quest:run.quest};
    default:run.done=true;return {type:'close'};
  }
}
// NPC menu page assembled from placed-NPC text (item_ex/desc, gossip hello) plus quest and shop entries.
export function npcMenu(npc,{available,completable,inProgress,shop,greeting}) {
  const buttons=[];
  for(const q of completable)buttons.push({action:'quest-finish',label:`✔ ${q.title}`,quest:q});
  for(const q of available)buttons.push({action:'quest-start',label:`！${q.title}`,quest:q});
  for(const q of inProgress)buttons.push({action:'quest-progress',label:`… ${q.title}`,quest:q});
  if(shop)buttons.push({action:'shop',label:'看看商品'});
  buttons.push({action:'close',label:'再见'});
  return {npcId:npc.id,content:greeting||npc.desc||npc.hello?.[0]||`${npc.name}向你点了点头。`,buttons};
}
