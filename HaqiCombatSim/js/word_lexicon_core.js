// Static vocabulary only; no IO, DOM or probabilistic stemming.
export const WORD_LANGUAGES=['zh','en','ja','ko'];
export const wordLanguage=value=>({ 'zh-CN':'zh',jp:'ja' }[value]||String(value||'').split('-')[0]);
export const normalizeWord=value=>String(value).normalize('NFKC').toLowerCase().replaceAll('’',"'");
export const wordTreeKey=(key,language)=>language==='en'?key:`${key}:${language}`;
export function parseWordLexicon(text,language){
 language=wordLanguage(language);if(!WORD_LANGUAGES.includes(language))throw Error('不支持的词库语言');
 const entries=[],seen=new Set();let line=0;
 for(const raw of String(text).split(/\r?\n/)){line++;if(!raw.trim()||raw.trimStart().startsWith('#'))continue;
  const at=raw.indexOf('||');if(at<1)throw Error(`词库第 ${line} 行格式无效`);
  const id=normalizeWord(raw.slice(0,at).trim());let row;try{row=JSON.parse(raw.slice(at+2));}catch{throw Error(`词库第 ${line} 行内容无效`);}
  if(seen.has(id)||id.length>48||!/^\p{L}[\p{L}\p{M}\s'’-]*$/u.test(id)||typeof row.meaning!=='string'||!row.meaning.trim()||!Array.isArray(row.forms)||!Array.isArray(row.senses)||row.forms.some(x=>typeof x!=='string'||!x||x.length>80)||row.senses.some(x=>typeof x!=='string'||!x))throw Error(`词库第 ${line} 行词条无效`);
  seen.add(id);entries.push({id,text:id,meaning:row.meaning,forms:[...new Set(row.forms.map(normalizeWord))].filter(x=>x!==id),senses:[...new Set(row.senses)],pos:row.pos||'',pronunciation:row.reading||''});
 }
 return {version:1,language,title:'常用字词',entries};
}
export function buildWordIndex(data){
 const entries=new Map(),aliases=new Map(),senses=new Map(),trie=new Map();
 for(const entry of data.entries){entries.set(entry.id,entry);for(const form of [entry.id,...entry.forms]){const key=normalizeWord(form);if(!aliases.has(key))aliases.set(key,entry.id);else if(aliases.get(key)!==entry.id)aliases.set(key,null);}
  for(const sense of entry.senses){if(!senses.has(sense))senses.set(sense,new Set());senses.get(sense).add(entry.id);}}
 // Ambiguous spellings stay ambiguous, including a lemma which is another word's inflection.
 let maxLength=0;for(const [form,id] of aliases){maxLength=Math.max(maxLength,form.length);let node=trie;for(const char of form){if(!node.has(char))node.set(char,new Map());node=node.get(char);}node.id=id;node.terminal=true;}
 return {language:data.language,data,entries,aliases,senses,trie,maxLength};
}
export function canonicalWord(index,text){return index.aliases.get(normalizeWord(text))||null;}
export function sentenceWordTokens(index,text){
 const tokens=[];let at=0;
 const gap=value=>{if(index.language==='en')return [...normalizeWord(value).matchAll(/[a-z]+(?:['’-][a-z]+)*/g)].map(m=>m[0]);if(index.language==='ko')return value.match(/[가-힣]+/gu)||[];return [...value].filter(c=>/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c));};
 for(const word of matchWordText(index,text)){tokens.push(...gap(text.slice(at,word.start)),word.id);at=word.end;}tokens.push(...gap(text.slice(at)));return tokens;
}
// Normalize code points separately while retaining offsets into the unchanged original string.
function normalizedText(text){let value='',starts=[],ends=[],offset=0;for(const char of text){const part=normalizeWord(char);value+=part;for(let i=0;i<part.length;i++){starts.push(offset);ends.push(offset+char.length);}offset+=char.length;}return {value,starts,ends};}
const latin=char=>!!char&&/[\p{Script=Latin}\p{N}\p{M}'’-]/u.test(char);
const hangul=char=>!!char&&/[가-힣]/u.test(char);
const koreanParticles=new Set(['은','는','이','가','을','를','의','에','에서','에게','한테','께','으로','로','와','과','하고','도','만','부터','까지','보다','처럼','이나','나','랑','이랑','에는','에도','에서는','에서도','에게는','에게도','으로는','로는','입니다','이에요','예요','이었다','였다']);
export function matchWordText(index,text,{stats}={}){
 text=String(text);const {value,starts,ends}=normalizedText(text),matches=[];let i=0;
 while(i<value.length){if(index.language==='ko'&&hangul(value[i])&&hangul(value[i-1])){i++;continue;}let node=index.trie,best=null,j=i;
  while(j<value.length){const char=String.fromCodePoint(value.codePointAt(j));if(stats)stats.steps=(stats.steps||0)+1;node=node.get(char);if(!node)break;j+=char.length;
   let koreanBoundary=true;if(node.terminal&&index.language==='ko'&&hangul(value[j])){let end=j;while(hangul(value[end]))end++;koreanBoundary=koreanParticles.has(value.slice(j,end));}
   if(node.terminal&&koreanBoundary&&(!latin(value[i])||!latin(value[i-1]))&&(!latin(value[j-1])||!latin(value[j])))best={id:node.id,end:j};}
  if(best){if(best.id)matches.push({id:best.id,start:starts[i],end:ends[best.end-1],text:text.slice(starts[i],ends[best.end-1])});i=best.end;}
  else i+=String.fromCodePoint(value.codePointAt(i)).length;
 }
 return matches;
}
export function localWordMapping(lines,indexes,state){
 const matches=lines.map((line,i)=>matchWordText(indexes[i],line.text)),pairs=[],used=new Set(),bySense=new Map();
 for(const word of matches[1])for(const sense of indexes[1].entries.get(word.id).senses){if(!bySense.has(sense))bySense.set(sense,[]);bySense.get(sense).push(word);}
 const target=matches[0].filter(w=>state?.words?.[w.id]?.mark!=='know');
 for(const word of target){const candidates=new Set();for(const sense of indexes[0].entries.get(word.id).senses)for(const other of bySense.get(sense)||[])if(!used.has(other.start))candidates.add(other);
  // Multiple occurrences of the same lemma are paired in reading order. Different lemmas are ambiguous.
  if(new Set([...candidates].map(w=>w.id)).size!==1)continue;const other=[...candidates].sort((a,b)=>a.start-b.start)[0];used.add(other.start);pairs.push({target:word,native:other});}
 const ranges=[target.map(w=>({...w,wordId:w.id})),pairs.map(p=>({...p.native,wordId:p.target.id}))];
 for(const [n,pair] of pairs.entries()){const color=`hsl(${(n*137.508)%360} 65% 32%)`;ranges[0].find(w=>w.start===pair.target.start).color=color;ranges[1][n].color=color;}
 return lines.map((line,i)=>wordParts(line.text,ranges[i]));
}
export function wordParts(text,ranges){let at=0;const parts=[];for(const r of [...ranges].sort((a,b)=>a.start-b.start)){if(r.start<at)continue;if(r.start>at)parts.push({text:text.slice(at,r.start)});parts.push({text:text.slice(r.start,r.end),wordId:r.wordId,color:r.color||null});at=r.end;}if(at<text.length)parts.push({text:text.slice(at)});return parts;}
export function supplementWordMapping(lines,local,model,index,state){
 const spans=parts=>{let start=0;return parts.map(p=>{const r={...p,start,end:start+p.text.length};start=r.end;return r;});};
 const ranges=local.map(parts=>spans(parts).filter(p=>p.wordId)),source=spans(model[0]),translation=spans(model[1]);
 for(const part of source){if(!part.color||ranges[0].some(r=>part.start<r.end&&part.end>r.start&&r.color))continue;
  const other=translation.find(p=>p.color===part.color);if(!other||ranges[1].some(r=>other.start<r.end&&other.end>r.start))continue;
  const normalized=normalizeWord(part.text);if(!/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(normalized)||normalized.length>48)continue;
  if(index.aliases.has(normalized)&&!index.aliases.get(normalized))continue;
  const id=canonicalWord(index,part.text)||normalized;if(state?.words?.[id]?.mark==='know')continue;
  // Replace an unpaired local token only when its exact range agrees with the model.
  if(ranges[0].some(r=>part.start<r.end&&part.end>r.start&&(r.start!==part.start||r.end!==part.end)))continue;
  ranges[0]=ranges[0].filter(r=>r.start!==part.start);ranges[0].push({...part,wordId:id});ranges[1].push({...other,wordId:id});
 }
 return lines.map((line,i)=>wordParts(line.text,ranges[i]));
}
export function seedWordLexicon(state,index){
 state.language=index.language;
 if(state.lexiconSeedVersion===1&&Object.hasOwn(state.words,index.data.entries[0]?.id))return;
 for(const e of index.data.entries)if(!Object.hasOwn(state.words,e.id))state.words[e.id]={id:e.id,ordinal:state.sequence++,source:`vocabulary:${index.language}`,label:'常用字词',count:0,firstAt:0,lastAt:0,interval:0,mark:null,contexts:[],relations:[],evidence:[]};
 state.lexiconSeedVersion=1;
}
export function migrateWordLexicon(state,index){
 if(state.lexiconVersion===1)return;
 const canonical=id=>canonicalWord(index,id)||id,groups=new Map();
 for(const word of Object.values(state.words)){const id=canonical(word.id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(word);}
 const words={};
 for(const [id,rows] of groups){const sorted=[...rows].sort((a,b)=>(b.markAt||0)-(a.markAt||0)||({unknown:4,curious:4,basic:3,know:1}[b.mark]||2)-({unknown:4,curious:4,basic:3,know:1}[a.mark]||2));const row={...sorted[0],id};
  row.ordinal=Math.min(...rows.map(w=>w.ordinal));row.count=rows.reduce((n,w)=>n+w.count,0);row.lastAt=Math.max(...rows.map(w=>w.lastAt));row.firstAt=Math.min(...rows.map(w=>w.firstAt).filter(Boolean),row.lastAt);row.contexts=[...new Map(rows.flatMap(w=>w.contexts).map(c=>[c.id,c])).values()].sort((a,b)=>b.at-a.at).slice(0,5);
  row.relations=[...new Map(rows.flatMap(w=>w.relations).map(r=>({...r,id:canonical(r.id)})).filter(r=>r.id!==id).map(r=>[r.id,r])).values()].slice(0,12);
  // Never pool independent evidence streaks into new mastery.
  row.evidence=sorted[0].evidence;row.cloudMastered=row.mark==='know'&&!!sorted[0].cloudMastered;words[id]=row;
 }
 state.words=words;state.masteryEarned=[...new Set((state.masteryEarned||[]).map(canonical))];if(state.masteryRewardPending)state.masteryRewardPending=[...new Set(state.masteryRewardPending.map(canonical))];for(const q of state.questions)q.target=canonical(q.target);state.lexiconVersion=1;
}
