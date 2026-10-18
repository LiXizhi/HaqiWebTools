import {earnedMastery,restoreMastery,validateMasteryList} from './language_tree_dictionary_core.js';
// Only word lists cross this IO boundary. Learning evidence and status stay local.
export function createMasterySync({key,getKey=()=>key,store,language,remote}){
 let known=null,queue=Promise.resolve();const valid=()=>getKey()===key;
 async function run(){if(!valid()||!remote)return;
  if(!known){known=validateMasteryList(await remote.read());if(!valid())return;await store.update(key,s=>restoreMastery(s,known[language]));}
  const {state}=await store.read(key);if(!valid())return;
  const pending=earnedMastery(state).filter(id=>!known[language].includes(id));
  // A newly earned word causes one acknowledged list write. Retries never upload other fields.
  for(const id of pending){if(!valid())return;const next=validateMasteryList({...known,[language]:[...known[language],id]});await remote.write(next);if(!valid())return;known=next;}
 }
 return {sync(){const task=queue.catch(()=>{}).then(run);queue=task;return task;}};
}
