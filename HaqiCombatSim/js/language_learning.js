import { speechCode } from './locale_core.js';
import { parseMemory, serializeMemory, countSentences, speechGain } from './language_learning_core.js';

const CHANNEL = 'aichat.external-tool.v1';

export function createTutor() {
    let frame = null;
    let ready;
    let resolveReady;
    const pending = new Map();
    function resetReady() {
        ready = new Promise(resolve => { resolveReady = resolve; });
    }
    resetReady();
    function onMessage(event) {
        const message = event.data;
        if (!message || message.channel !== CHANNEL) return;
        if (message.type === 'host:ready' || message.type === 'tool:ready') {
            resolveReady();
            if (frame && message.type === 'host:ready') {
                frame.contentWindow?.postMessage({ channel: CHANNEL, type: 'host:init', app: 'HaqiAdventure', capabilities: ['llm'] }, '*');
            }
        }
        const waiter = message.requestId && pending.get(message.requestId);
        if (!waiter) return;
        clearTimeout(waiter.timer);
        pending.delete(message.requestId);
        if (message.ok === false || message.error) waiter.reject(new Error(message.error || 'AIChat 请求失败'));
        else waiter.resolve(message);
    }
    function mount() {
        if (frame) return;
        window.addEventListener('message', onMessage);
        const url = new URL(location.hostname === 'localhost' || location.hostname === '127.0.0.1'
            ? '../AIChat/AIChat.html'
            : 'https://keepwork.com/api/raw/official/apps/tools/AIChat/release/AIChat_v1.html', location.href);
        url.searchParams.set('layout', 'agent');
        url.searchParams.set('compact', '1');
        url.searchParams.set('hide', 'pet');
        url.searchParams.set('chat', 'new');
        url.searchParams.set('persist', '0');
        url.searchParams.set('frontpage', 'hide');
        url.searchParams.set('workspace', 'HaqiAdventure');
        frame = document.createElement('iframe');
        frame.hidden = true;
        frame.tabIndex = -1;
        frame.title = '语言学习';
        frame.setAttribute('aria-hidden', 'true');
        frame.allow = 'microphone; autoplay';
        frame.src = url.toString();
        document.body.append(frame);
    }
    function request(type, detail, timeoutMs = 90000) {
        mount();
        const target = frame?.contentWindow;
        if (!target) return Promise.reject(new Error('语言老师还没有准备好'));
        const requestId = `haqi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('语言老师没有及时回复')); }, timeoutMs);
            pending.set(requestId, { resolve, reject, timer });
            target.postMessage({ channel: CHANNEL, type, requestId, ...detail }, '*');
        });
    }
    async function requestLLM(messages, { model } = {}) {
        await Promise.race([ready, new Promise((_, reject) => setTimeout(() => reject(new Error('语言老师还没有准备好')), 30000))]);
        const response = await request('tool:llm-request', { includeHistory: false, presentation: 'tool', reasoning: false, ...(model ? { model } : {}), messages });
        return String(response.text || response.result?.text || '').trim();
    }
    return {
        mount,
        requestLLM,
        requestVoice(action, prompt) {
            return request('host:voice', { action, ...(prompt ? { prompt } : {}) }, 45000);
        },
        stop() {
            window.removeEventListener('message', onMessage);
            frame?.remove();
            frame = null;
            resetReady();
        },
    };
}

export function profileFromSave(save) {
    const learning = save.languageLearning || { native: 'zh-CN', target: 'en' };
    return parseMemory(save.learnerMemory, learning.native, learning.target);
}

export function rememberProfile(save, profile) {
    const next = { ...profile, nativeLanguage: save.languageLearning.native, targetLanguage: save.languageLearning.target, updatedAt: new Date().toISOString() };
    save.learnerMemory = serializeMemory(next);
    return save.learnerMemory;
}

export async function syncMemory(save, cloud) {
    if (!cloud?.owner) return save.learnerMemory || '';
    try {
        const remote = await cloud.readMemory();
        if (remote && !save.learnerMemory) save.learnerMemory = remote;
        else if (save.learnerMemory) await cloud.writeMemory(save.learnerMemory);
    } catch { /* Local mirror remains. */ }
    return save.learnerMemory || '';
}

export function tutorSystem(profile, extra) {
    return `You are a Haqi NPC helping a learner. Reply only in ${profile.targetLanguage}. Use 1-3 short sentences and at most one question. Learner level is ${profile.level} out of 100. Notes: ${profile.notes || 'none'}. ${extra}`;
}

export function judgeTranscript({ transcript, level, topic }) {
    const sentences = countSentences(transcript);
    const need = Math.max(1, Math.round(1 + level / 40));
    return { pass: sentences >= need && String(transcript || '').trim().length >= 8, sentences, need, topic };
}

export function battleSpeechScore(text, hints, hintTranslations) {
    const sentences = countSentences(text);
    const spoken = String(text || '').toLowerCase();
    const relevant = hints.filter((hint, index) => {
        const translated = String(hintTranslations[index] || hint).toLowerCase();
        return translated && spoken.includes(translated.slice(0, Math.min(12, translated.length)));
    }).length;
    return speechGain({ sentences, relevant });
}

export function recognitionLanguage(locale) {
    return speechCode(locale);
}
