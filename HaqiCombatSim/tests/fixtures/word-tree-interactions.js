import {WordTree} from '../../js/word_tree.js';
import {setTreeMark,validateTreeQuestions} from '../../js/language_tree_core.js';
import {tenDictionaryExamples,buildExampleTree} from './word-tree-data.js';
const params=new URLSearchParams(location.search);
const entries=(await (await fetch(new URL('../../data/adventure/dictionary/en.json',import.meta.url))).json()).entries;
 let demo=buildExampleTree(tenDictionaryExamples(entries),entries,Date.now()-18*60000);
  if(params.get('sample')==='fruit'){
   for(const id of ['help','door','open','friend','please'])setTreeMark(demo,id,'basic');
   for(const id of ['help','door','friend'])setTreeMark(demo,id,'know');
   const question=(target,sentence,translation,other)=>({target,sentence,translation,options:[{text:translation,explanation:translation},{text:other[0],explanation:'这不是句子的含义。'},{text:other[1],explanation:'这不是句子的含义。'}],answer:0,glosses:{}});
   demo.questions=validateTreeQuestions({questions:[question('help','Please help my friend.','请帮助我的朋友。',['请打开窗户。','我的朋友在家。']),question('door','Please open my door.','请打开我的门。',['请帮助我。','谢谢你的帮助。']),question('friend','My friend can help.','我的朋友可以帮忙。',['我的门开着。','我的妈妈在家。'])]},demo).map((q,i)=>({...q,demo:true,availableAt:Date.now()+i*15000}));
  }
  const config={key:'preview',online:()=>false,store:{async read(){return {state:structuredClone(demo),persisted:true};},async update(_,reduce){const result=reduce(demo);return {state:structuredClone(demo),result,persisted:true};}}};
const tree=new WordTree(document.querySelector('main'),{...config,data:{language:'en',entries}});
window.languageTreeQA=tree;await tree.ready;
