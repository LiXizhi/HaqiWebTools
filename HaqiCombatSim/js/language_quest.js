import {loadLanguageCourses} from './language_course.js';
import {languageTreeContext,languageTreeStore} from './language_tree_capture.js';
import {wordLanguage,wordTreeKey} from './word_lexicon_core.js';
import {languageQuestRows} from './language_quest_core.js';
import {coursePosition} from './language_course_core.js';

export function createLanguageQuestJournal({getSave,onChange}){
    let session=null;
    function current(s){const c=languageTreeContext();return session===s&&getSave()===s.save&&c?.key===s.key&&c?.epoch===s.epoch&&wordLanguage(getSave()?.languageLearning?.target)===s.language;}
    function clear(){session?.unsubscribe?.();session=null;}
    function ensure(){
        const save=getSave(),context=languageTreeContext();
        if(!save||!context?.key){clear();return;}
        if(session&&current(session))return session.ready;
        clear();const s=session={save,key:context.key,epoch:context.epoch,language:wordLanguage(save.languageLearning?.target),rows:[],loading:true,error:''};
        s.ready=(async()=>{try{
            const {data}=await loadLanguageCourses(s.language);if(!current(s))return;
            const key=wordTreeKey(s.key,s.language);
            const update=result=>{if(!current(s)||!result.persisted)return;const progress=JSON.stringify(result.state.courses||{});if(!s.loading&&s.progress===progress)return;s.progress=progress;s.rows=languageQuestRows(data,result.state,s.language);s.loading=false;onChange();};
            s.unsubscribe=languageTreeStore.subscribe(key,update);
            const result=await languageTreeStore.read(key);if(!current(s))return;
            if(!result.persisted)throw Error('本地语言任务记录暂时不可用');update(result);
        }catch(error){if(current(s)){s.loading=false;s.error=error.message;onChange();}}})();return s.ready;
    }
    return {ensure,clear,retry(){clear();ensure();},snapshot(){return session&&current(session)?{rows:session.rows,loading:session.loading,error:session.error}:{rows:[],loading:true,error:''};},
        battleTicket(encounterId){const s=session;if(!s||!current(s))return null;const row=s.rows.find(r=>r.region===s.save.zone&&r.interaction?.kind==='encounter'&&r.interaction.id===encounterId&&!r.battleWon);return row?{courseId:row.courseId,stepId:row.course.steps[row.next].id,language:s.language,encounterId}:null;},
        async won(ticket){if(!ticket)return false;if(session?.error)clear();await ensure();const s=session;if(!s||!current(s)||ticket.language!==s.language)return false;if(s.error)throw Error(s.error);
            const row=s.rows.find(r=>r.courseId===ticket.courseId);if(!row||row.region!==s.save.zone)return false;
            const result=await languageTreeStore.update(wordTreeKey(s.key,s.language),state=>{
                if(!current(s))return false;const step=row.course.steps[coursePosition(state,row.course)];
                if(!step||step.id!==ticket.stepId||step.interaction?.kind!=='encounter'||step.interaction.id!==ticket.encounterId)return false;
                state.courses??={};state.courses[row.courseId]??={};state.courses[row.courseId].sceneWins??={};state.courses[row.courseId].sceneWins[step.id]=true;return true;
            });if(!result.persisted)throw Error('战斗后的语言任务进度未保存，请重试结算');return result.result;
        }
    };
}
