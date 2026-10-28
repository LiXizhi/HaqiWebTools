import {canonicalWord} from './word_lexicon_core.js';

// Author-approved sentence frame; nouns come only from learned, present props.
// These supporting nouns never become additional effective-practice targets.
export function homePreferenceOptions(objects,catalog,state,index){
 const names=new Map();
 if(index.language!=='en')return {alternatives:[],objects:[]};
 for(const object of objects){
  const name=catalog.find(item=>item.id===object.itemId)?.en?.trim().toLowerCase();
  if(!name||!/^\p{Script=Latin}+(?: \p{Script=Latin}+)*$/u.test(name))continue;
  const word=canonicalWord(index,name);
  if(!word||!state.words?.[word]?.lastPractice?.at)continue;
  if(!names.has(name))names.set(name,[]);
  names.get(name).push({id:object.id,itemId:object.itemId});
 }
 const alternatives=[],bindings=[];
 for(const name of [...names.keys()].sort()){
  bindings.push(...names.get(name));
  for(const article of ['my','the'])alternatives.push({id:`preference-${article}-${name.replaceAll(' ','-')}`,answer:`I like ${article} ${name}.`});
 }
 return {alternatives,objects:bindings};
}
export function homePreferenceCurrent(preference,objects){
 return !preference||preference.objects.every(saved=>objects.some(object=>object.id===saved.id&&object.itemId===saved.itemId));
}
