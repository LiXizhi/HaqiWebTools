import {createCloseButton} from './view_adventure_controls.js';
import {tr} from './locale_runtime.js';

const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=text;return n;};
const button=(label,run,cls='secondary')=>{const n=el('button',cls,tr(label));n.type='button';n.onclick=run;return n;};
export function createLearningView(callbacks) {
    const root=el('div','overlay learning-overlay');root.hidden=true;
    document.body.append(root);
    let trigger=null;
    root.addEventListener('keydown',e=>{
        e.stopPropagation();
        if(e.key==='Escape'){e.preventDefault();callbacks.close();}
        if(e.key==='Tab'){
            const controls=[...root.querySelectorAll('button:not(:disabled)')];
            const first=controls[0],last=controls.at(-1);
            if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
            else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
        }
    });
    return {
        close(){root.hidden=true;root.classList.remove('visible');root.replaceChildren();if(trigger?.isConnected)trigger.focus({preventScroll:true});},
        render(state){
            if(root.hidden)trigger=document.activeElement;
            root.hidden=false;root.classList.add('visible');root.replaceChildren();
            const box=el('section','modal learning-room');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label',tr('营地语言冒险'));
            const exit=createCloseButton(callbacks.close,'关闭语言冒险');
            const head=el('header','modal-header');head.append(el('h2','',tr(state.title||'营地语言冒险')),exit);
            const body=el('div','modal-body');box.append(head,body);root.append(box);
            if(state.courses){
                body.append(el('p','muted',tr('选择一门课程。基础交流后可进行剧情挑战。')));
                for(const course of state.courses)body.append(button(course.title,()=>callbacks.course(course.id),'secondary learning-course'));
                body.append(button('自由交谈（无奖励）',()=>callbacks.free(),'secondary learning-course'));
            }else if(state.mode==='listening'){
                body.append(el('p','',tr('先听一句话，再选出它的意思。答题不发奖励。')));
                const listen=button('听示范',callbacks.listen);listen.disabled=state.busy;body.append(listen);
                for(const choice of state.choices){const option=button('',()=>callbacks.choose(choice.id),'secondary learning-course');option.textContent=choice.text;option.disabled=!state.heard||state.busy||state.done;body.append(option);}
                if(state.done)body.append(button('再练一次',callbacks.retry,'secondary learning-course'));
            }else if(state.question){
                if(state.topic)body.append(el('p','muted',`${tr('背包中的物品')}：${state.topic.entityName} × ${state.topic.count}`));
                body.append(el('p','learning-question',state.question));
                if(state.hint)body.append(el('p','muted',state.hint));
                if(state.answer)body.append(el('p','learning-answer',state.answer));
                if(state.answerHint)body.append(el('p','muted',state.answerHint));
                const tools=el('div','learning-actions');
                const listen=button('听示范',callbacks.listen);listen.disabled=state.busy||state.recording;
                const mic=button(state.recording?'结束录音':'点击录音',callbacks.record,'primary');mic.disabled=state.busy||state.done;
                tools.append(listen,mic);body.append(tools);
                if(state.mode==='basic'){const quiz=button('听力小测（不发奖励）',callbacks.listening,'secondary learning-course');quiz.disabled=state.busy||state.recording;body.append(quiz);}
                if(state.mode==='basic'&&state.unlocked)body.append(button('进入剧情挑战',callbacks.challenge,'primary learning-course'));
                if(state.mode==='challenge'){
                    const progress=el('progress','');progress.max=100;progress.value=state.score;progress.setAttribute('aria-label',tr('挑战进度'));body.append(progress,el('p','',`${state.score} / 100 · ${state.turns} / ${state.maxTurns}`));
                    for(const goal of state.goals)body.append(el('p','muted',`${goal.done?'✓ ':''}${goal.text}`));
                }
                if(state.history?.length){const history=el('div','learning-history');for(const row of state.history)history.append(el('p','',row));body.append(history);}
                if(state.done)body.append(button('再练一次',callbacks.retry,'secondary learning-course'));
            }
            if(state.reward!==undefined)body.append(el('p','muted',`${tr('本次可得')}：${state.reward} ${tr(state.currency===100?'奇豆':'仙豆')} · ${tr('达到每日上限仍可练习')}`));
            const status=el('p','learning-status',tr(state.status||''));status.setAttribute('role','status');body.append(status);
            const focus=state.recording?body.querySelector('.primary'):exit;focus?.focus({preventScroll:true});
        },
    };
}
