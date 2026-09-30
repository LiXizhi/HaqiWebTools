import {dailyBuffs,DAILY_BUFF_NAMES} from './language_daily_buff_core.js';
import {speechRewardStatus} from './language_speech_rewards_core.js';
import {tr,setText,fill} from './locale_runtime.js';
import {localeChoices} from './locale.js';
import {learningModeDraft} from './language_encounter_core.js';
import {createSettingsControls} from './view_settings_controls.js';

export function renderLearningMode(body,model,cb,{el,button}) {
    const draft=learningModeDraft(model.save,model.displayLocale||model.save.locale),ui=createSettingsControls({el,button});
    let picked=draft.selectionConfirmed;
    const statusRewards=speechRewardStatus(model.save,model.assets?.content),buffs=dailyBuffs(model.save);
    const count=el('strong','speech-count',String(statusRewards.count));
    const hero=el('div','speech-hero',el('div','speech-seal',count,el('small','','今日开口')),el('div','speech-heading',el('h3','','开口有礼'),el('p','','说一句，变强一点！'),el('small','','找居民聊聊，或为副本剧情配音。')));
    const stats=el('div','speech-stats');
    for(const [key,value] of Object.entries(buffs))stats.append(el('div','speech-stat',el('span','',DAILY_BUFF_NAMES[key]),el('strong','',`+${value}%`)));
    const next=statusRewards.rewards.find(r=>!r.claimed),progress=el('progress','speech-progress');
    progress.max=next?.target||40;progress.value=Math.min(statusRewards.count,progress.max);progress.setAttribute('aria-label',tr('今日开口奖励进度'));
    const hint=el('p','speech-next');
    setText(hint,next?(next.ready?'有奖励可以领取！':'再说 {count} 句，解锁下一份奖励'):'今日奖励已全部领取',next?{count:Math.max(0,next.target-statusRewards.count)}:{});
    const rewards=el('div','speech-rewards');
    for(const row of statusRewards.rewards){
        const currency=row.itemId===100?'奇豆':'仙豆',coin=el('span',`speech-coin ${row.itemId===100?'':'fairy'}`,row.itemId===100?'奇':'仙');coin.setAttribute('aria-hidden','true');
        const threshold=el('small','speech-threshold');setText(threshold,'{count} 句',{count:row.target});
        const amount=el('strong','speech-amount');setText(amount,'{amount} '+currency,{amount:row.amount});
        const claim=button(row.claimed?'已领取':row.ready?'领取':'未解锁',()=>cb.action({type:'speech-reward',index:row.index}),'primary speech-claim');
        claim.disabled=!row.ready;claim.setAttribute('aria-label',fill('{count}句奖励：{amount}{currency}，{state}',{count:row.target,amount:row.amount,currency,state:row.claimed?'已领取':row.ready?'领取':'未解锁'}).text);
        rewards.append(el('article',`speech-reward${row.ready?' ready':''}${row.claimed?' claimed':''}`,threshold,coin,amount,claim));
    }
    const rules=el('details','speech-rules',el('summary','','玩法与奖励规则'),el('p','','每次有效开口随机增加 1% 属性，生命、攻击、防御各最多 +10%；叠满后增加超级魔力生成率，最多 +10%。'),el('p','','口语交流或剧情跟读通过后计数；听示范、文字回答不计数。奇豆可买宠物口粮，仙豆可强化装备。'),el('p','','每天本机时间 00:00 重置，每档奖励限领一次。加成与开口进度仅保存在本机当前角色；换地图仍有效，新战斗生效。领取记录随角色保存。'));
    body.append(el('section','speech-adventure',hero,stats,el('div','speech-track',hint,progress),rewards,rules));
    const display=document.createElement('select'),target=document.createElement('select');
    for(const l of localeChoices()){display.add(new Option(l.name,l.id));target.add(new Option(l.name+(!['en','zh-CN'].includes(l.id)?tr('（营地课程尚未开放）'):''),l.id));}
    display.value=draft.locale;target.value=draft.target;display.setAttribute('aria-label',tr('显示语言'));target.setAttribute('aria-label',tr('目标语言'));
    const status=el('p','settings-note');
    const apply=button(model.save.languageLearning.enabled?'保存设置':'开启双语学习',()=>cb.applyLearningMode({...draft,target:target.value,locale:display.value,native:draft.native!==target.value?draft.native:display.value!==target.value?display.value:target.value==='en'?'zh-CN':'en'}),'primary');
    function refresh(){const supported=['en','zh-CN'].includes(target.value);apply.disabled=!supported;setText(status,!supported?'该语言的营地课程尚未开放。':'从简单短句开始，点击录音才会开启麦克风。');}
    display.onchange=()=>{draft.locale=display.value;if(!draft.selectionConfirmed)draft.native=display.value;if(!picked)target.value=display.value==='en'?'zh-CN':'en';refresh();};
    target.onchange=()=>{picked=true;refresh();};
    body.append(ui.section('选择语言',ui.field('显示语言',display),ui.field('目标语言',target),status),apply);
    if(model.save.languageLearning.enabled)body.append(button('关闭双语学习',cb.disableLearning,'secondary'));
    body.append(button('更多语言与音色设置',()=>cb.panel('settings'),'secondary'));
    refresh();
}
