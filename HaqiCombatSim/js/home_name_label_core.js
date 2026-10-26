// A small authored writing task, not a general grammar or identity validator.
// Children may use a fictional nickname; never require their real name.
export function homeNameLabel(text){
 if(typeof text!=='string'||text.length>80)return null;
 const match=/^my\s+name\s+is\s+(.+?)[.!]?$/iu.exec(text.normalize('NFC').trim());
 if(!match)return null;
 const name=match[1].trim();
 if(name.length>36||!/^\p{Script=Latin}[\p{Script=Latin}\p{M}]*(?:['’-]\p{Script=Latin}[\p{Script=Latin}\p{M}]*)?(?: +\p{Script=Latin}[\p{Script=Latin}\p{M}]*(?:['’-]\p{Script=Latin}[\p{Script=Latin}\p{M}]*)?){0,2}$/u.test(name))return null;
 if(['your name','name','nickname'].includes(name.toLowerCase()))return null;
 return {name,text:`My name is ${name}.`};
}

export function homeNameLabelCurrent(binding,objects){
 return !binding||objects.some(o=>o.id===binding.objectId&&o.itemId===binding.itemId&&o.label===binding.label);
}
