import {loadKeepwork} from './adventure_cloud.js';
import {saveWorkspaceFile} from './keepwork_file_io.js';
import {validateMasteryList} from './language_tree_dictionary_core.js';
const cache=new Map(),queues=new Map();
function bounded(task){let timer;return Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('掌握清单同步超时，已保留在本机')),15000);})]).finally(()=>clearTimeout(timer));}
export function masteryCloud({owner,role,valid,load=loadKeepwork}){
 const path=`language-tree/${encodeURIComponent(role)}/mastered.json`;let sdk,store,token;
 async function ready(){sdk=await load();token=sdk.token;store=sdk.personalPageStore.withWorkspace('HaqiAdventure');check();}
 function check(){if(!valid()||!token||sdk.token!==token||store.getUsername()!==owner||store.isUseLocal())throw Error('掌握清单尚未同步：登录状态已变化');}
 const cacheKey=owner+':'+path;
 return {async read(){await ready();const hit=cache.get(cacheKey);if(hit?.token===token)return structuredClone(hit.value);check();
  const full=store.getRemotePagePath(path),parts=full.split('/');if(!full.startsWith(owner+'/'))throw Error('掌握清单账号不一致');
  let value;try{const raw=await bounded(sdk.loadPageCache(sdk.getRepoPath(parts.slice(0,2).join('/')),sdk.safeEncodeURIComponent(full)));check();const text=typeof raw==='string'?raw:raw?.content;if(typeof text!=='string'||!text)throw Error('掌握清单读取失败');value=validateMasteryList(JSON.parse(text));}catch(error){check();if(error?.status===404||/\b404\b/.test(error?.message||''))value={en:[],zh:[]};else throw error;}
  cache.set(cacheKey,{token,value});return structuredClone(value);
 },async write(value){const clean=validateMasteryList(value);check();const task=(queues.get(cacheKey)||Promise.resolve()).catch(()=>{}).then(async()=>{check();const latest=cache.get(cacheKey);const merged=validateMasteryList({en:[...clean.en,...(latest?.token===token?latest.value.en:[])],zh:[...clean.zh,...(latest?.token===token?latest.value.zh:[])]});await saveWorkspaceFile({store,owner,path,text:JSON.stringify(merged),check});cache.set(cacheKey,{token,value:merged});});queues.set(cacheKey,task);await bounded(task);}};
}
