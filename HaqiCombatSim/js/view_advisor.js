// view_advisor.js — AI 建议页：启发式自动调参（Worker 池评估） + 大模型建议（OpenAI 兼容 API）。
import { state, setSetting, updateParams, setParams } from './state.js';
import { SCHOOLS, cloneParams, diffParams } from './combat_params_core.js';
import { buildJobs, aggregateMatrix, aggregateGlobal, mergeStats } from './sim_batch_core.js';
import { SimPool } from './sim_pool.js';
import { tuneProportional, tuneCoordinate } from './sim_tuner_core.js';
import { buildPrompt, requestAdvice, parseParamPatch, heuristicAdvice } from './llm_advisor.js';
import { SCHOOL_NAMES, SCHOOL_COLORS } from './combat_presets_core.js';
import { h, clear, select, numberInput, pct, fmt, toast, download } from './utils.js';

export function renderAdvisor(main) {
    const ds = state.dataset;
    const batch = state.lastBatch && state.lastBatch.version === ds.version ? state.lastBatch : null;

    // ---- 最近结果摘要 ----
    const summaryPanel = h('div.panel', h('h2', '最近一次批量结果'));
    if (!batch) {
        summaryPanel.appendChild(h('div.muted', '还没有结果。先在 ', h('a', { href: '#batch' }, '批量模拟'), ' 跑一轮，再回来生成建议。'));
    } else {
        const m = batch.matrix;
        summaryPanel.appendChild(h('div.small', `${batch.dataset} · ${batch.cfg.mode} · 每组 ${batch.cfg.games} 场 · 等级 ${batch.cfg.level} · ${new Date(batch.at).toLocaleString()} · 极差 ${pct(m.balance.spread)} 标准差 ${pct(m.balance.std, 2)}`));
        summaryPanel.appendChild(h('div.row', ...SCHOOLS.map(s => h('span.tag', { class: s }, `${SCHOOL_NAMES[s]} ${pct(m.summary[s].winRate)}`))));
        const ha = heuristicAdvice(batch);
        summaryPanel.appendChild(h('h3', '规则化快速建议'));
        summaryPanel.appendChild(h('div.advice', ha.text));
        summaryPanel.appendChild(h('div.row', h('button', { onClick: () => { updateParams(ha.patch); toast('已应用 HP 乘子建议，请重新批量模拟验证'); } }, '一键应用 HP 乘子建议')));
    }
    main.appendChild(summaryPanel);

    // ---- 自动调参 ----
    const tunePanel = h('div.panel', h('h2', '启发式自动调参'));
    const tcfg = state.settings.tuner || (state.settings.tuner = { method: 'proportional', field: 'hp', iterations: 5, games: 100, gain: 0.8, mode: (state.settings.batch.mode || '1v1') });
    let tuning = false;
    let stopFlag = false;
    let tunePool = null;
    const stepsEl = h('div.steps');
    const tuneBtn = h('button.primary', { onClick: runTune }, '开始调参');
    const stopBtn = h('button.danger', { disabled: true, onClick: () => { stopFlag = true; if (tunePool) tunePool.cancel(); } }, '停止');
    const applyBox = h('div');
    tunePanel.appendChild(h('div.row',
        h('label', '方法 ', select([{ value: 'proportional', label: '比例控制（快）' }, { value: 'coordinate', label: '坐标下降（稳）' }], tcfg.method, (v) => { tcfg.method = v; setSetting('tuner', tcfg); })),
        h('label', '调整项 ', select([{ value: 'hp', label: 'perSchool.hp' }, { value: 'damage', label: 'perSchool.damage' }, { value: 'heal', label: 'perSchool.heal' }, { value: 'accuracy', label: 'perSchool.accuracy(+%)' }], tcfg.field, (v) => { tcfg.field = v; setSetting('tuner', tcfg); })),
        h('label', '模式 ', select(['1v1', '2v2', '3v3', '4v4'], tcfg.mode, (v) => { tcfg.mode = v; setSetting('tuner', tcfg); })),
        h('label', '迭代 ', numberInput(tcfg.iterations, (v) => { tcfg.iterations = v || 3; setSetting('tuner', tcfg); }, { min: 1, max: 30 })),
        h('label', '每组场次 ', numberInput(tcfg.games, (v) => { tcfg.games = v || 50; setSetting('tuner', tcfg); }, { min: 20, step: 50 })),
        h('label', '增益 ', numberInput(tcfg.gain, (v) => { tcfg.gain = v || 0.5; setSetting('tuner', tcfg); }, { step: 0.1, min: 0.1, max: 2 })),
        tuneBtn, stopBtn,
    ));
    tunePanel.appendChild(h('div.muted.small', '目标：各系对外胜率趋近 50%（Σ(胜率-0.5)² + 0.5·Σ平局率²）。每次评估跑一轮 25 组对局；每组场次越大越准但越慢。结果不会自动应用。'));
    tunePanel.appendChild(stepsEl);
    tunePanel.appendChild(applyBox);
    main.appendChild(tunePanel);

    async function evaluateWith(params) {
        const cfg = { mode: tcfg.mode, games: tcfg.games, level: state.settings.batch.level || batch?.cfg.level || 60, policy: state.settings.batch.policy || 'deck_attacker', seed: state.settings.batch.seed || 1, chunk: Math.max(25, Math.ceil(tcfg.games / 2)) };
        const jobs = buildJobs(ds, cfg);
        const byMatchup = {};
        tunePool = new SimPool({ size: state.settings.batch.workers || 4 });
        try {
            const results = await tunePool.run(ds, params, jobs, () => {});
            for (const st of results) byMatchup[st.matchup] = mergeStats(byMatchup[st.matchup], st);
        } finally { tunePool.terminate(); }
        return aggregateMatrix(byMatchup, SCHOOLS);
    }

    async function runTune() {
        if (tuning) return;
        tuning = true; stopFlag = false;
        tuneBtn.disabled = true; stopBtn.disabled = false;
        clear(stepsEl); clear(applyBox);
        const t0 = performance.now();
        const onStep = (s) => {
            stepsEl.appendChild(h('div', `#${s.iter} obj=${s.objective.toFixed(4)} 极差=${pct(s.spread)} ${s.note} | ` + SCHOOLS.map(x => `${SCHOOL_NAMES[x]} ${fmt(s.factors[x], 3)}→${pct(s.rates[x], 0)}`).join(' ')));
            stepsEl.scrollTop = stepsEl.scrollHeight;
        };
        try {
            const opts = { field: tcfg.field, iterations: tcfg.iterations, rounds: tcfg.iterations, gain: tcfg.gain, onStep, shouldStop: () => stopFlag, step: tcfg.field === 'accuracy' ? 5 : 0.1, minStep: tcfg.field === 'accuracy' ? 1 : 0.005, minFactor: tcfg.field === 'accuracy' ? -50 : 0.6, maxFactor: tcfg.field === 'accuracy' ? 50 : 1.6 };
            const res = tcfg.method === 'coordinate' ? await tuneCoordinate(state.params, evaluateWith, opts) : await tuneProportional(state.params, evaluateWith, opts);
            const diffs = diffParams(state.params, res.best);
            applyBox.appendChild(h('h3', `最优结果 · obj=${res.bestObjective.toFixed(4)} · 极差 ${pct(res.bestMatrix.balance.spread)} · 用时 ${((performance.now() - t0) / 1000).toFixed(0)}s`));
            applyBox.appendChild(h('div.row', ...SCHOOLS.map(s => h('span.tag', { class: s }, `${SCHOOL_NAMES[s]} ${tcfg.field}=${fmt(res.best.perSchool[s][tcfg.field], 3)} → ${pct(res.bestMatrix.summary[s].winRate)}`))));
            applyBox.appendChild(h('div.diff', ...diffs.map(d => h('div', h('span.path', d.path), h('span.from', String(d.from)), h('span.to', String(d.to))))));
            applyBox.appendChild(h('div.row',
                h('button.primary', { onClick: () => { setParams(res.best); toast('已应用调参结果'); } }, '应用到数值面板'),
                h('button', { onClick: () => download(`haqi_tuned_${ds.version}.json`, JSON.stringify(res, null, 1)) }, '导出调参记录'),
            ));
        } catch (e) {
            console.error(e);
            toast('调参出错：' + e.message);
        } finally {
            tuning = false; tuneBtn.disabled = false; stopBtn.disabled = true;
        }
    }

    // ---- LLM ----
    const llm = state.settings.llm;
    const llmPanel = h('div.panel', h('h2', '大模型建议（OpenAI 兼容 API）'));
    const notes = h('textarea', { rows: 3, placeholder: '可选：补充策划意图，如“希望风暴保持高爆发但更脆”“3v3 优先”…' });
    const promptTa = h('textarea', { rows: 10, style: { display: 'none' } });
    const adviceEl = h('div.advice', { style: { display: 'none' } });
    const patchBox = h('div');
    let abort = null;
    const askBtn = h('button.primary', { disabled: !batch, onClick: ask }, '生成建议');
    llmPanel.appendChild(h('div.row',
        h('label', 'Endpoint ', h('input', { value: llm.endpoint, style: { width: '340px' }, onChange: (e) => { llm.endpoint = e.target.value.trim(); setSetting('llm', llm); } })),
        h('label', 'Model ', h('input', { value: llm.model, style: { width: '150px' }, onChange: (e) => { llm.model = e.target.value.trim(); setSetting('llm', llm); } })),
        h('label', 'API Key ', h('input', { type: 'password', value: llm.apiKey, style: { width: '200px' }, onChange: (e) => { llm.apiKey = e.target.value.trim(); setSetting('llm', llm); } })),
    ));
    llmPanel.appendChild(notes);
    llmPanel.appendChild(h('div.row', { style: { marginTop: '6px' } },
        askBtn,
        h('button', { disabled: !batch, onClick: () => { promptTa.value = buildPrompt(batch, ds, notes.value); promptTa.style.display = promptTa.style.display === 'none' ? '' : 'none'; } }, '查看/编辑提示词'),
        h('button', { disabled: !batch, onClick: () => { navigator.clipboard.writeText(buildPrompt(batch, ds, notes.value)).then(() => toast('提示词已复制，可粘贴到任意聊天模型')); } }, '复制提示词'),
        h('button', { onClick: () => { const t = prompt('粘贴模型回复（含 ```json 参数块）：'); if (t) showAdvice(t); } }, '粘贴回复解析'),
        h('span.muted.small', 'Key 仅保存在本机 localStorage；兼容 OpenAI / DeepSeek / Moonshot / 本地 Ollama(/v1/chat/completions) 等。'),
    ));
    llmPanel.appendChild(promptTa);
    llmPanel.appendChild(adviceEl);
    llmPanel.appendChild(patchBox);
    main.appendChild(llmPanel);

    async function ask() {
        if (!batch) return;
        askBtn.disabled = true;
        adviceEl.style.display = '';
        adviceEl.textContent = '请求中…';
        clear(patchBox);
        abort = new AbortController();
        try {
            const p = promptTa.style.display !== 'none' && promptTa.value ? promptTa.value : buildPrompt(batch, ds, notes.value);
            const text = await requestAdvice(llm, p, abort.signal);
            showAdvice(text);
        } catch (e) {
            adviceEl.textContent = '请求失败：' + e.message + '\n\n可改用“复制提示词”手动询问模型，再用“粘贴回复解析”应用参数。';
        } finally { askBtn.disabled = false; }
    }

    function showAdvice(text) {
        adviceEl.style.display = '';
        adviceEl.textContent = text;
        clear(patchBox);
        const patch = parseParamPatch(text);
        if (!patch) { patchBox.appendChild(h('div.muted.small', '未解析到 json 参数块。')); return; }
        const preview = cloneParams(state.params);
        const merged = JSON.parse(JSON.stringify(preview));
        (function walk(dst, src) { for (const k of Object.keys(src)) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) { dst[k] = dst[k] || {}; walk(dst[k], src[k]); } else dst[k] = src[k]; } })(merged, patch);
        const diffs = diffParams(state.params, merged);
        patchBox.appendChild(h('h3', `解析到参数补丁（${diffs.length} 处变更）`));
        patchBox.appendChild(h('div.diff', ...diffs.map(d => h('div', h('span.path', d.path), h('span.from', String(d.from)), h('span.to', String(d.to))))));
        patchBox.appendChild(h('div.row', h('button.primary', { onClick: () => { updateParams(patch); toast('已应用模型建议，请重新批量模拟验证'); } }, '一键应用'), h('button', { onClick: () => download('haqi_llm_patch.json', JSON.stringify(patch, null, 2)) }, '导出补丁')));
    }

    return () => { stopFlag = true; if (tunePool) tunePool.cancel(); if (abort) abort.abort(); };
}
