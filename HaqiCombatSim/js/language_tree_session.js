import {emptyLanguageTree,treeReadiness,treeQuestionMessages,validateTreeQuestions,setTreeMark,answerTreeQuestion} from './language_tree_core.js';
// Session-scoped cancellation and persistent generation protect account switches and clear.
export function createLanguageTreeSession({key,getKey=()=>key,store,request,online=()=>false,onChange=()=>{},onMastery=null}){
    let active=true,abort=new AbortController(),state=emptyLanguageTree(),busy=false,warning='';
    const valid=()=>active&&getKey()===key;
    const emit=()=>{if(valid())onChange({state,busy,warning});};
    async function write(reduce){if(!valid())return;const result=await store.update(key,s=>{if(valid())return reduce(s);});if(!valid())return;state=result.state;warning=result.persisted?'':'记录未保存，本次仅保存在内存中。';emit();return result;}
    return {get state(){return state;},get busy(){return busy;},async open(){const result=await store.read(key);if(!valid())return;state=result.state;warning=result.persisted?'':'本地记录暂时不可用。';emit();},
        async mark(id,mark){return write(s=>setTreeMark(s,id,mark));},
        async hint(id){return write(s=>{const q=s.questions.find(q=>q.id===id);if(q&&!q.completed)q.hinted=true;});},
        async answer(id,index,at=Date.now()){const before=new Set(state.masteryEarned||[]);const result=await write(s=>answerTreeQuestion(s,id,index,at));if(result?.persisted&&state.masteryEarned?.some(id=>!before.has(id)))try{await onMastery?.();}catch(e){warning='掌握清单未同步，已保留在本机，下次打开重试。';emit();}return result;},
        async clear(){abort.abort();abort=new AbortController();busy=false;return write(s=>{const generation=s.generation+1;Object.assign(s,emptyLanguageTree(),{generation});});},
        async prepare(){if(!valid()||busy||!treeReadiness(state).ready)return;if(state.questions.some(q=>!q.completed&&['know','basic'].includes(state.words[q.target]?.mark))){emit();return;}
            if(!online()||!request){warning='暂不可在线验证；仍可浏览、标记和使用缓存题。';emit();return;}
            busy=true;warning='正在用遇见过的词准备三道新题…';emit();const controller=abort,generation=state.generation,snapshot=structuredClone(state);
            try{let questions,error;const messages=treeQuestionMessages(snapshot);
                for(let attempt=0;attempt<2;attempt++){const raw=await request(attempt?[...messages,{role:'user',content:`上一份题目未通过校验：${error}。请重新生成完整三题。`}]:messages,controller.signal);if(!valid()||controller.signal.aborted)return;
                    try{questions=validateTreeQuestions(typeof raw==='string'?JSON.parse(raw):raw,snapshot);break;}catch(e){error=e.message;}}
                if(!questions)throw Error('生成的题目未通过校验，未更新理解记录。');
                await write(s=>{if(controller.signal.aborted||s.generation!==generation||s.questions.some(q=>!q.completed&&['know','basic'].includes(s.words[q.target]?.mark)))return;const current=validateTreeQuestions({questions},s);const time=Date.now();s.questions=[...s.questions.filter(q=>q.completed),...current.map((q,i)=>({...q,availableAt:time+i*15000}))].slice(-60);});
            }catch(e){if(valid()&&!controller.signal.aborted)warning=`暂不可验证：${e.message}`;}
            finally{if(controller===abort){busy=false;emit();}}
        },close(){active=false;abort.abort();}
    };
}
