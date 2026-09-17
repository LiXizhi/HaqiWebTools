// state.js — 应用级状态（数据集、BalanceParams、设置、最近一次批量结果），localStorage 持久化。
import { defaultParams, mergeParams, cloneParams } from './combat_params_core.js';

const LS_KEY = 'haqi_combat_sim_v1';

export const state = {
    datasets: [],       // discoverDatasets 结果
    datasetDir: null,
    dataset: null,      // 已加载的数据集
    params: null,       // BalanceParams
    settings: {
        level: null,
        workers: null,
        llm: { endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: '', model: 'gpt-4o-mini' },
        battle: { mode: '1v1', near: ['fire'], far: ['ice'], humanSlot: 0, botPolicy: 'deck_attacker', seed: '' },
        batch: { mode: '1v1', games: 300, policy: 'deck_attacker', seed: 1 },
    },
    lastBatch: null,    // { cfg, matrix, global, params, byMatchup, at }
    listeners: new Set(),
};

export function subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
}

export function notify(what) {
    for (const fn of state.listeners) fn(what);
}

export function loadPersisted() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        return JSON.parse(raw);
    } catch { return {}; }
}

export function persist() {
    try {
        const paramsByVersion = loadPersisted().paramsByVersion || {};
        if (state.params) paramsByVersion[state.params.version] = state.params;
        localStorage.setItem(LS_KEY, JSON.stringify({
            datasetDir: state.datasetDir,
            settings: state.settings,
            paramsByVersion,
        }));
    } catch (e) { /* ignore */ }
}

/** 切换数据集后初始化参数：优先本地保存的同版本参数 */
export function initParamsForDataset(dataset) {
    const saved = (loadPersisted().paramsByVersion || {})[dataset.version];
    state.params = saved ? mergeParams(defaultParams(dataset.version), saved) : defaultParams(dataset.version);
    notify('params');
}

export function setParams(params) {
    state.params = cloneParams(params);
    persist();
    notify('params');
}

export function updateParams(patch) {
    state.params = mergeParams(state.params, patch);
    persist();
    notify('params');
}

export function resetParams() {
    state.params = defaultParams(state.dataset ? state.dataset.version : 'teen');
    persist();
    notify('params');
}

export function setSetting(path, value) {
    const parts = path.split('.');
    let o = state.settings;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] || (o[parts[i]] = {});
    o[parts[parts.length - 1]] = value;
    persist();
}

export function restoreSettings() {
    const saved = loadPersisted();
    if (saved.settings) {
        state.settings = { ...state.settings, ...saved.settings, llm: { ...state.settings.llm, ...(saved.settings.llm || {}) }, battle: { ...state.settings.battle, ...(saved.settings.battle || {}) }, batch: { ...state.settings.batch, ...(saved.settings.batch || {}) } };
    }
    if (saved.datasetDir) state.datasetDir = saved.datasetDir;
}
