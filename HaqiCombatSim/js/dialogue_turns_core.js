// Presentation only: keep the current exchange visible without discarding history.
// Original row identities are retained for speech feedback and reveal tracking.
export function partitionGuidedMessages(messages){
 const lastNpc=messages.findLastIndex(row=>row.role!=='user');
 if(lastNpc<0)return {history:messages.slice(0,-1),current:messages.slice(-1)};
 const visible=new Set([lastNpc]);
 if(messages.length-1>lastNpc)visible.add(messages.length-1);
 return {history:messages.filter((_,i)=>!visible.has(i)),current:messages.filter((_,i)=>visible.has(i))};
}
