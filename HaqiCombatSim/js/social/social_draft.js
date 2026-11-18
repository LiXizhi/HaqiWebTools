import {languageId,languageName} from '../character_relationship_core.js';

const styles={en:'natural simple English',ja:'natural simple Japanese',ko:'natural simple Korean','zh-CN':'natural simple Chinese'};
const scripts={en:/[A-Za-z]/,ja:/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u,ko:/\p{Script=Hangul}/u,'zh-CN':/\p{Script=Han}/u};

// Keep draft generation local to the active role and language. This never sends mail.
export function createSocialDraftEditor({voice,getContext,read,write}){
    let ticket=0,pending=null;
    const context=()=>{const current=getContext();return {...current,target:languageId(current.save?.languageLearning?.target)};};
    const same=(a,b)=>a.save===b.save&&a.owner===b.owner&&a.roleId===b.roleId&&a.target===b.target;
    function cancel(){ticket++;pending?.abort();pending=null;}
    async function translate(key,kind='target'){
        cancel();const id=ticket,before=context(),source=String(read(key)||'');
        if(!source.trim())throw Error('请先填写草稿');
        const target=kind==='zh'?'zh-CN':before.target,abort=new AbortController();pending=abort;
        const current=()=>id===ticket&&!abort.signal.aborted&&same(before,context())&&read(key)===source;
        try{
            const result=await voice.judge([
                {role:'system',content:`Rewrite the user's message in ${styles[target]}. Preserve meaning and use only the requested language; do not fall back to English. Return JSON {"reply":"editable draft","completed":[]}. Do not send anything.`},
                {role:'user',content:source}
            ],abort.signal);
            if(!current())return false;
            const reply=typeof result?.reply==='string'?result.reply.trim():'';
            if(!reply||!scripts[target].test(reply))throw Error('未能生成'+languageName(target)+'草稿，请重试。');
            write(key,reply);return true;
        }catch(error){if(!current())return false;throw error;}
        finally{if(pending===abort)pending=null;}
    }
    return {translate,cancel};
}
