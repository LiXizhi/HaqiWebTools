const key=(homeId,id)=>JSON.stringify([homeId,id]);
export function homeStoryProgress(state,homeId,id){return state.homeStories?.[key(homeId,id)]||{next:0,objects:{},pets:{}};}
export function resetHomeStory(state,homeId,id){if(state.homeStories)delete state.homeStories[key(homeId,id)];}
// Explicit replay only; opening a completed story must remain read-only.
export function replayHomeStory(state,homeId,id,total){
 const old=homeStoryProgress(state,homeId,id);
 if(!Number.isSafeInteger(total)||total<1||total>32||old.next!==total)return false;
 state.homeStories[key(homeId,id)]={next:0,objects:{},pets:{},replayCount:(Number.isSafeInteger(old.replayCount)&&old.replayCount>=0?old.replayCount:0)+1,lastCompletedAt:old.at};
 return true;
}
export function recordHomeStory(state,event){
 const story=event.review?.story;
 if(!story||typeof story.id!=='string'||typeof story.homeId!=='string'||typeof story.storyId!=='string'||typeof story.objectId!=='string'||!story.objectId||!Number.isSafeInteger(story.step)||story.step<0||story.step>31||event.source!=='home-story:'+story.storyId)return false;
 const old=homeStoryProgress(state,story.homeId,story.id);
 if(old.next!==story.step)return false;
 state.homeStories??={};
 state.homeStories[key(story.homeId,story.id)]={...(old.replayCount?{replayCount:old.replayCount,lastCompletedAt:old.lastCompletedAt}:{}),next:story.step+1,objects:{...old.objects,[story.step]:story.objectId},pets:{...old.pets,...(typeof story.petId==='string'&&story.petId?{[story.step]:story.petId}:{})},at:event.at};
 return true;
}
export function validateHomeStoryArcs(data){
 const ids=new Set();
 for(const arc of data.arcs||[]){
  if(!arc.id||ids.has(arc.id)||!arc.title?.trim()||!arc.ending?.trim()||!Array.isArray(arc.steps)||!arc.steps.length||arc.steps.length>32)throw Error('家园连续故事配置无效');
  ids.add(arc.id);
  for(const [i,step] of arc.steps.entries()){
   if(!data.games.some(g=>g.id===step.storyId&&g.arcOnly===arc.id&&['talk','find','write','place','care','arrange','draw','door','walk','stand','run','jump','read','listen','count'].includes(g.mode))||!Array.isArray(step.useObjects)||step.useObjects.some(n=>!Number.isInteger(n)||n<0||n>=i)||(step.usePet!==undefined&&(!Number.isInteger(step.usePet)||step.usePet<0||step.usePet>=i)))throw Error('家园连续故事步骤或物品引用无效');
   // Counting owns a set snapshot, not one reusable object binding.
   if(data.games.find(g=>g.id===step.storyId)?.mode==='count'&&step.useObjects.length||step.useObjects.some(n=>data.games.find(g=>g.id===arc.steps[n].storyId)?.mode==='count'))throw Error('计数故事不能把整组物品作为单件物品引用');
   if(step.usePet!==undefined&&(!data.games.some(g=>g.id===arc.steps[step.usePet].storyId&&['pet-use','talk'].includes(g.action?.kind))||!data.games.some(g=>g.id===step.storyId&&['pet-use','talk'].includes(g.action?.kind))))throw Error('家园故事伙伴必须来自已完成的宠物互动');
  }
 }
 return data;
}
