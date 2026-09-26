import { battleGoal, testDurationMs } from './language_learning_core.js';
import { textFor, speakText, localeChoices } from './locale.js';
import { recognitionLanguage } from './language_learning.js';
import {loadLearningOptions,createLearningVoice} from './language_adventure_voice.js';
import { createSettingsControls } from './view_settings_controls.js';
let learningOptions={models:[],voices:[]};

export function languageSettings(body, model, cb, { el, button }) {
    const learning = model.save.languageLearning;
    const ui = createSettingsControls({ el, button });
    body.append(ui.section('界面语言', ui.localeSelector(model.save.locale, cb.setLocale)));
    const section = ui.section('语言学习',
        ui.toggle({ icon: '💬', label: '语言学习', hint: '在对话与任务中练习目标语言。' }, !!learning.enabled, () => cb.setLearning({ ...learning, enabled: !learning.enabled })));
    if (learning.enabled) {
        section.append(
            ui.field('母语', pairRow('native', learning, cb, { el, button })),
            ui.field('目标语言', pairRow('target', learning, cb, { el, button })),
            el('p', 'muted settings-note', '营地课程支持中文和英语。其他语言课程尚未提供。录音只在点击后开启。'),
            ui.toggle({ icon: '🔉', label: '语音陪伴', hint: '朗读对话与示范回答。' }, !!learning.autoSpeak, () => cb.setLearning({ ...learning, autoSpeak: !learning.autoSpeak })),
            ui.toggle({ icon: '📖', label: '双语释义', hint: '对话中同时显示另一种语言的意思。' }, learning.showChinese !== false, () => cb.setLearning({ ...learning, showChinese: learning.showChinese === false })),
        );
        const settings=document.createElement('div');settings.className='learning-settings';
        const modelSelect=document.createElement('select'),voiceSelect=document.createElement('select');
        const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');
        function populate(select,rows,value,label){
            select.replaceChildren(new Option(label,''));
            for(const row of rows)select.add(new Option(row.name,row.id));
            if(value&&!rows.some(row=>row.id===value))select.add(new Option(select===voiceSelect?'已保存的音色（加载列表查看名称）':`${value}（已选）`,value));
            select.value=value||'';
        }
        populate(modelSelect,learningOptions.models.map(id=>({id,name:id})),learning.model,'默认对话模型');populate(voiceSelect,learningOptions.voices,learning.voiceType,'默认音色');
        for(const [name,select] of [['对话评判模型',modelSelect],['朗读音色',voiceSelect]]){
            const label=document.createElement('label');label.textContent=name;label.append(select);settings.append(label);
        }
        const refresh=button('加载可用模型和音色',async()=>{
            refresh.disabled=true;status.textContent='正在加载…';
            try{const options=await loadLearningOptions();learningOptions=options;if(!settings.isConnected)return;
                populate(modelSelect,options.models.map(id=>({id,name:id})),modelSelect.value,'默认对话模型');
                populate(voiceSelect,options.voices,voiceSelect.value,'默认音色');status.textContent='选择后点击保存；下次对话判断和朗读时生效。';
            }catch(error){status.textContent=error.message;}finally{refresh.disabled=false;}
        },'secondary');
        const preview=button('试听音色',async()=>{
            preview.disabled=true;const voice=createLearningVoice({getSettings:()=>({voiceType:voiceSelect.value})}),abort=new AbortController();
            const observer=new MutationObserver(()=>{if(!settings.isConnected){abort.abort();void voice.cancel();observer.disconnect();}});
            observer.observe(document.body,{childList:true,subtree:true});
            try{await voice.speak(learning.target==='en'?'Hello! Welcome to the Magic Camp.':'你好！欢迎来到魔法营地。',learning.target,abort.signal);}
            catch(error){if(settings.isConnected)status.textContent=error.message;}finally{observer.disconnect();await voice.cancel();preview.disabled=false;}
        },'secondary');
        settings.append(refresh,preview,button('保存模型和音色',()=>cb.setLearning({...learning,model:modelSelect.value,voiceType:voiceSelect.value}),'primary'),status);
        section.append(settings);
    }
    body.append(section);
}

function pairRow(field, learning, cb, { el, button }) {
    const row = el('div', 'locale-choices');
    for (const locale of localeChoices()) {
        const selected = learning[field] === locale.id;
        const control = button(locale.name, () => {
            const next = { ...learning, [field]: locale.id };
            if (next.native === next.target) next.target = next.native === 'en' ? 'zh-CN' : 'en';
            cb.setLearning(next);
        }, selected ? 'primary small' : 'secondary small');
        control.setAttribute('aria-pressed', String(selected));
        row.append(control);
    }
    return row;
}

export function renderFreeTalk(root, model, npc, cb, { el, button }) {
    const learning = model.save.languageLearning;
    root.replaceChildren();
    root.className = 'overlay visible';
    const box = el('section', 'modal language-room');
    box.setAttribute('role', 'dialog');
    const log = el('div', 'language-log');
    const input = document.createElement('textarea');
    input.className = 'language-input';
    input.rows = 3;
    const status = el('p', 'muted', '自由交谈');
    const send = button('发送', () => submit(input.value), 'primary');
    const mic = button('按住说话', () => {}, 'secondary');
    const phone = button('对话挑战', () => cb.voice(npc), 'secondary');
    box.append(el('header', 'modal-header', el('h2', '', npc.name), button('下次再聊', cb.close, 'secondary small')), status, log, input, el('div', 'language-actions', send, mic, phone));
    root.append(box);
    let listening = false;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    mic.disabled = !Recognition;
    mic.addEventListener('pointerdown', () => {
        if (!Recognition || listening) return;
        const session = new Recognition();
        session.lang = recognitionLanguage(learning.target);
        session.onresult = event => { input.value = event.results?.[0]?.[0]?.transcript || input.value; };
        session.start();
        listening = true;
        mic.addEventListener('pointerup', () => { session.stop(); listening = false; }, { once: true });
    });
    function add(role, text) {
        log.append(el('p', role === 'user' ? 'language-user' : 'language-npc', text));
        log.scrollTop = log.scrollHeight;
    }
    async function submit(value) {
        const answer = String(value || '').trim();
        if (!answer) return;
        input.value = '';
        add('user', answer);
        status.textContent = '…';
        try {
            const reply = await cb.reply(npc, answer);
            add('npc', reply);
            speakText(reply);
            status.textContent = '自由交谈';
        } catch (error) {
            status.textContent = error.message || '语言老师还没有准备好';
        }
    }
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(input.value); } });
    cb.greet(npc).then(text => { if (text) { add('npc', text); speakText(text); } }).catch(() => { status.textContent = '语言老师还没有准备好'; });
}

export function renderLanguageTest(root, model, task, cb, { el, button }) {
    const learning = model.save.languageLearning;
    const duration = testDurationMs(task.price, task.prices);
    root.replaceChildren();
    root.className = 'overlay visible';
    const box = el('section', 'modal language-room');
    const hints = el('ul', 'language-hints');
    for (const hint of task.hints) {
        const item = el('li', '', hint);
        item.textContent = textFor(hint, learning.native);
        hints.append(item);
    }
    const input = document.createElement('textarea');
    input.className = 'language-input';
    const remain = el('p', '', '');
    const status = el('p', 'muted', task.name);
    box.append(el('header', 'modal-header', el('h2', '', '语言挑战'), button('下次再聊', () => finish(false), 'secondary small')), status, remain, hints, input);
    root.append(box);
    const started = Date.now();
    const timer = setInterval(() => {
        const left = Math.max(0, duration - (Date.now() - started));
        remain.textContent = `${Math.ceil(left / 1000)}s`;
        if (!left) finish(true);
    }, 250);
    function finish(judge) {
        clearInterval(timer);
        if (!judge) { cb.close(); return; }
        cb.finish(input.value, duration);
    }
}

export function battleChallengeBar(model, { el, button }) {
    const learning = model.save.languageLearning;
    if (!learning?.enabled) return null;
    const goal = battleGoal(model.battle?.seed);
    const bar = el('div', 'learning-battle');
    const meter = el('div', 'learning-meter', el('i'));
    meter.firstChild.style.width = `${model.learningProgress || 0}%`;
    const hints = el('div', 'learning-hints');
    for (const hint of goal.hints) {
        const item = el('span', '', hint);
        item.textContent = textFor(hint, learning.native);
        hints.append(item);
    }
    const input = document.createElement('input');
    input.className = 'language-input';
    const send = button('发送', () => model.onBattleSpeech?.(input.value, goal), 'primary small');
    bar.append(el('p', '', goal.goal), meter, hints, input, send);
    return bar;
}
