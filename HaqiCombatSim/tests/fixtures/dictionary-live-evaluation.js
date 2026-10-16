import {parseDialogueJson} from '../../js/dialogue_json_core.js';
import {contextVerdictMessages,validateContextVerdict} from '../../js/dictionary_core.js';
import {loadDictionary} from '../../js/adventure_dictionary.js';
import {createLearningVoice} from '../../js/language_adventure_voice.js';
import {requestsEnglishExample,resolveTutorMode,presentTutorReply,tutorMessages,tutorComparisons,validateTutorReply} from '../../js/dictionary_tutor_core.js';

// Isolated teaching/semantic evaluation: no persistence, player state or rewards.
export function createTeachingEvaluation(parent,getState){
    const section=document.createElement('section'),title=document.createElement('h2'),run=document.createElement('button'),stop=document.createElement('button'),status=document.createElement('p'),results=document.createElement('div');
    title.textContent='教学样例逐项验收';run.textContent='运行真实教学样例';stop.textContent='停止验收';run.disabled=true;stop.disabled=true;status.setAttribute('role','status');
    const note=document.createElement('p');note.textContent='逐项调用当前 Keepwork 模型。结构通过不等于教学通过，请按每项检查点人工阅读。结果仅保留在页面，刷新清空。';
    const kind=document.createElement('select');kind.setAttribute('aria-label','验收类型');for(const [value,label] of [['teaching','小老师讲解'],['context','情境判题'],['content','新版词条例句'],['interaction','求助与字词比较'],['forms','词形与讲解切换'],['alternatives','合理表达与复习目标'],['hanzi','汉字联想与反馈依据']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option);}
    section.append(title,note,kind,run,stop,status,results);parent.append(section);
    let request=null,ready=false;
    const cancel=()=>{request?.abort();request=null;kind.disabled=false;stop.disabled=true;run.disabled=!ready;status.textContent='已停止；已显示结果保留，迟到回复不会追加。';};
    stop.onclick=cancel;
    run.onclick=async()=>{
        if(!ready||request)return;
        const identity=getState(),active=new AbortController();request=active;kind.disabled=true;run.disabled=true;stop.disabled=false;results.replaceChildren();
        const valid=()=>request===active&&!active.signal.aborted&&getState()===identity;
        const voice=createLearningVoice({getSettings:()=>identity.save.languageLearning});let completed=0,failed=0,mismatched=0;
        try{
            const response=await fetch(kind.value==='hanzi'?'./dictionary-hanzi-cases.json':kind.value==='alternatives'?'./dictionary-alternative-cases.json':kind.value==='forms'?'./dictionary-form-cases.json':kind.value==='context'?'./dictionary-context-cases.json':kind.value==='content'?'./dictionary-content-cases.json':kind.value==='interaction'?'./dictionary-interaction-cases.json':'./dictionary-teaching-cases.json',{signal:active.signal});if(!response.ok)throw Error('cases unavailable');const cases=await response.json();
            for(const item of cases){
                if(!valid())return;status.textContent=`正在运行 ${completed+1} / ${cases.length}：${item.id}`;
                const article=document.createElement('article'),heading=document.createElement('h3'),prompt=document.createElement('p'),checks=document.createElement('p'),reply=document.createElement('p');
                heading.textContent=item.id;prompt.textContent=item.question+(item.history?'\n对话背景：'+JSON.stringify(item.history):'')+(item.practice?'\n本地作答：'+JSON.stringify(item.practice):'');checks.textContent=item.answer!==undefined?'作答：'+item.answer+'；预期：'+(item.expected?'正确':'需要修改'):'检查点：'+item.checks.join('；');article.append(heading,prompt,checks,reply);results.append(article);
                let phase='材料加载',modelText='';
                try{
                    const data=await loadDictionary(item.language);if(!valid())return;const entry=data.entries.find(e=>e.id===item.entryId);if(!entry)throw Error('entry unavailable');
                    if(item.answer!==undefined){phase='模型请求';const rawText=await voice.judge(contextVerdictMessages(entry,item.question,item.answer),active.signal,{rawText:true});modelText=rawText;phase='JSON解析';const raw=parseDialogueJson(rawText);phase='判题结构校验';const verdict=validateContextVerdict(raw,entry,item.answer);if(!valid())return;if(verdict.correct!==item.expected)mismatched++;reply.textContent='判定：'+(verdict.correct?'正确':'需要修改')+'；与预期'+(verdict.correct===item.expected?'一致':'不一致')+'；反馈：'+verdict.feedback; }else{
                    const mode=resolveTutorMode(item.question,item.previousMode);phase='模型请求';const rawText=await voice.judge(tutorMessages(entry,item.language,item.history||[],item.question,{phase:'learn',...item.practice,interaction:mode},tutorComparisons(data,entry,item.question)),active.signal,{maxTokens:1200,rawText:true});modelText=rawText;phase='JSON解析';const raw=parseDialogueJson(rawText);phase='讲解结构校验';const value=presentTutorReply(validateTutorReply(raw,entry,{allowEnglishExample:requestsEnglishExample(item.question,item.history||[])}),mode);
                    if(!valid())return;reply.textContent=[value.reply,value.example,value.translation,value.question].filter(Boolean).join('\n');reply.style.whiteSpace='pre-wrap';}
                }catch{if(!valid())return;failed++;reply.textContent=phase+'失败；未记录服务原始错误。';if(phase==='JSON解析'||phase==='讲解结构校验'||phase==='判题结构校验'){const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');summary.textContent=`查看模型返回文本（${modelText.length}字符）`;text.textContent=modelText.slice(0,4000)||'（空文本）';text.style.whiteSpace='pre-wrap';details.append(summary,text);article.append(details);}}
                completed++;
            }
            if(valid())status.textContent=`完成 ${completed} 项，结构或请求失败 ${failed} 项，预期判定不一致 ${mismatched} 项；解释质量仍需人工评定。`;
        }catch{if(valid())status.textContent='验收材料加载失败。';}
        finally{if(request===active){request=null;kind.disabled=false;run.disabled=!ready;stop.disabled=true;}}
    };
    return {setReady(value){ready=value;if(!value&&request)cancel();run.disabled=!ready||!!request;},cancel};
}
