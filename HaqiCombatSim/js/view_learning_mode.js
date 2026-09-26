import {tr,setText} from './locale_runtime.js';
import {localeChoices} from './locale.js';
import {learningModeDraft} from './language_encounter_core.js';
import {createSettingsControls} from './view_settings_controls.js';

export function renderLearningMode(body,model,cb,{el,button}) {
    const draft=learningModeDraft(model.save,model.displayLocale||model.save.locale),ui=createSettingsControls({el,button});
    let picked=draft.selectionConfirmed;
    body.append(ui.section('在冒险中开口',el('p','','遇到营地居民，聊三句，练习问好、认识伙伴和请求帮助。没有固定顺序，随时可以离开。'),el('p','','说出的意思基本正确即可通过，不评测发音。可以听示范、看提示；文字求助不能代替口语。'),el('p','','完成交流可获得奇豆，用来购买宠物营养餐；后续挑战可获得用于强化装备的仙豆。具体金额与今日可领次数会在交流前显示。')));
    const display=document.createElement('select'),target=document.createElement('select');
    for(const l of localeChoices()){display.add(new Option(l.name,l.id));target.add(new Option(l.name+(!['en','zh-CN'].includes(l.id)?tr('（营地课程尚未开放）'):''),l.id));}
    display.value=draft.locale;target.value=draft.target;display.setAttribute('aria-label',tr('显示语言'));target.setAttribute('aria-label',tr('目标语言'));
    const status=el('p','settings-note');
    const apply=button(model.save.languageLearning.enabled?'保存设置':'开启双语学习',()=>cb.applyLearningMode({...draft,target:target.value,locale:display.value,native:draft.native!==target.value?draft.native:display.value!==target.value?display.value:target.value==='en'?'zh-CN':'en'}),'primary');
    function refresh(){const supported=['en','zh-CN'].includes(target.value);apply.disabled=!supported;setText(status,!supported?'该语言的营地课程尚未开放。':'营地先从简单的词语和短句开始。麦克风仅在点击录音时开启。');}
    display.onchange=()=>{draft.locale=display.value;if(!draft.selectionConfirmed)draft.native=display.value;if(!picked)target.value=display.value==='en'?'zh-CN':'en';refresh();};
    target.onchange=()=>{picked=true;refresh();};
    body.append(ui.section('选择语言',ui.field('显示语言',display),ui.field('目标语言',target),status),apply);
    if(model.save.languageLearning.enabled)body.append(button('关闭双语学习',cb.disableLearning,'secondary'));
    body.append(button('更多语言与音色设置',()=>cb.panel('settings'),'secondary'));
    refresh();
}
