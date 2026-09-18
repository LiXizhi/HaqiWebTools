// app.js — 入口：数据集发现/加载、hash 路由、顶部栏。
import { state, restoreSettings, initParamsForDataset, persist, notify } from './state.js';
import { loadDataset, discoverDatasets } from './data_core.js';
import { fetchJson } from './runtime_data.js';
import { h, clear, select, toast } from './utils.js';
import { renderBattle } from './view_battle.js';
import { renderBatch } from './view_batch.js';
import { renderParams } from './view_params.js';
import { renderAdvisor } from './view_advisor.js';

const routes = { battle: renderBattle, batch: renderBatch, params: renderParams, advisor: renderAdvisor };
let currentCleanup = null;

function currentRoute() {
    const r = (location.hash || '#battle').slice(1).split('?')[0];
    return routes[r] ? r : 'battle';
}

function renderNav() {
    const r = currentRoute();
    for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('active', a.dataset.route === r);
}

function renderDatasetBox() {
    const box = clear(document.getElementById('dataset-box'));
    if (!state.datasets.length) {
        box.appendChild(h('span', '未找到数据集：请运行 ', h('code', 'npm run export')));
        return;
    }
    box.appendChild(h('span', '数据集'));
    box.appendChild(select(state.datasets.map(d => ({ value: d.dir, label: `${d.name} · ${d.counts.cards || '?'} 卡` })), state.datasetDir, async (dir) => {
        await switchDataset(dir);
        render();
    }));
    if (state.dataset) box.appendChild(h('span.tag', state.dataset.version));
}

async function switchDataset(dir) {
    const main = document.getElementById('main');
    clear(main).appendChild(h('div.loading', `加载 ${dir} …`));
    try {
        state.dataset = await loadDataset(dir, fetchJson);
        state.datasetDir = dir;
        initParamsForDataset(state.dataset);
        persist();
        notify('dataset');
        renderDatasetBox();
    } catch (e) {
        toast(`加载数据集失败：${e.message}`);
        console.error(e);
    }
}

function render() {
    renderNav();
    const main = document.getElementById('main');
    if (currentCleanup) { try { currentCleanup(); } catch (e) { /* ignore */ } currentCleanup = null; }
    clear(main);
    if (!state.dataset) {
        main.appendChild(h('div.panel',
            h('h2', '没有可用数据集'),
            h('p', '在 ', h('code', 'web/HaqiCombatSim/'), ' 下运行 ', h('code', 'npm run export'), '（需要本机 ', h('code', 'config/Aries'), '），或使用内置 ', h('code', 'data/sample'), '。'),
            h('p.muted.small', '页面需通过 http 服务打开（如 ', h('code', 'python3 -m http.server 8080'), '），file:// 下 fetch/Worker 会被浏览器拦截。'),
        ));
        return;
    }
    const view = routes[currentRoute()];
    currentCleanup = view(main) || null;
}

async function boot() {
    restoreSettings();
    state.datasets = await discoverDatasets(fetchJson);
    const preferred = state.datasetDir && state.datasets.some(d => d.dir === state.datasetDir)
        ? state.datasetDir
        : (state.datasets.find(d => d.dir === 'data/teen') || state.datasets.find(d => d.dir === 'data/kids') || state.datasets[0] || {}).dir;
    if (preferred) await switchDataset(preferred);
    renderDatasetBox();
    render();
    window.addEventListener('hashchange', render);
}

boot();
