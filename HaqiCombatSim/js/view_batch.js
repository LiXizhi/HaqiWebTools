// view_batch.js — 批量模拟页：配置 → Worker 池 → 热力图 / 汇总 / 卡牌统计 / 导出。
import { state, setSetting } from './state.js';
import { SCHOOLS, diffParams, defaultParams } from './combat_params_core.js';
import { buildJobs, aggregateMatrix, aggregateGlobal, mergeStats } from './sim_batch_core.js';
import { SimPool } from './sim_pool.js';
import { SCHOOL_NAMES, SCHOOL_COLORS, MODES, defaultLevel } from './combat_presets_core.js';
import { h, clear, select, numberInput, pct, fmt, winColor, download, toast } from './utils.js';

let pool = null;

export function renderBatch(main) {
    const ds = state.dataset;
    const st = state.settings.batch;
    if (!st.level) st.level = defaultLevel(ds.version);
    if (!st.workers) st.workers = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));

    const cfgPanel = h('div.panel', h('h2', '批量模拟配置'));
    const progressPanel = h('div.panel', { style: { display: 'none' } });
    const resultBox = h('div');
    main.append(cfgPanel, progressPanel, resultBox);

    let running = false;
    const runBtn = h('button.primary', { onClick: run }, '开始模拟');
    const cancelBtn = h('button.danger', { disabled: true, onClick: () => { if (pool) pool.cancel(); running = false; } }, '取消');

    cfgPanel.appendChild(h('div.row',
        h('label', '模式 ', select(Object.keys(MODES), st.mode, (v) => { st.mode = v; setSetting('batch', st); })),
        h('label', '每组场次 ', numberInput(st.games, (v) => { st.games = v || 100; setSetting('batch', st); }, { min: 10, step: 50 })),
        h('label', '等级 ', numberInput(st.level, (v) => { st.level = v || 1; setSetting('batch', st); }, { min: 1, max: 100 })),
        h('label', '策略 ', select([{ value: 'deck_attacker', label: '官方 AI 卡组权重' }, { value: 'simple', label: '启发式' }, { value: 'random', label: '随机' }], st.policy, (v) => { st.policy = v; setSetting('batch', st); })),
        h('label', '种子 ', numberInput(st.seed, (v) => { st.seed = v || 1; setSetting('batch', st); })),
        h('label', 'Worker ', numberInput(st.workers, (v) => { st.workers = v || 1; setSetting('batch', st); }, { min: 1, max: 32 })),
        h('label', { title: '使用对战页“配卡”保存的自定义卡组（未自定义的系仍用官方预设）' }, h('input', { type: 'checkbox', checked: !!st.useCustomDecks, onChange: (e) => { st.useCustomDecks = e.target.checked; setSetting('batch', st); } }), ' 用对战页配卡'),
        runBtn, cancelBtn,
    ));
    const changes = diffParams(defaultParams(ds.version), state.params);
    const customDecks = ((state.settings.battle || {}).decks || {})[ds.version] || {};
    const G = state.params.global;
    cfgPanel.appendChild(h('div.muted.small', `数据集 ${ds.name}（${ds.version}）· 5 系两两对战含镜像 = 25 组 · 当前参数相对默认有 ${changes.length} 处修改 · 胜率合并 A→B 与 B→A 两向以抵消先手影响 · 卡包容量 ${G.deckCapacity || '不限'} / 单卡 ${G.deckEachCapacity || '不限'}${Object.keys(customDecks).length ? ` · 已自定义卡组：${Object.keys(customDecks).join(', ')}` : ''}`));

    async function run() {
        if (running) return;
        running = true;
        runBtn.disabled = true; cancelBtn.disabled = false;
        progressPanel.style.display = '';
        clear(progressPanel);
        const bar = h('div.progress', h('div', { style: { width: '0%' } }));
        const txt = h('div.small.muted', '准备…');
        progressPanel.append(h('h2', '进度'), bar, txt);
        const cfg = { mode: st.mode, games: st.games, level: st.level, policy: st.policy, seed: st.seed, chunk: Math.max(25, Math.ceil(st.games / 4)) };
        if (st.useCustomDecks && Object.keys(customDecks).length) cfg.decks = JSON.parse(JSON.stringify(customDecks));
        const jobs = buildJobs(ds, cfg);
        const byMatchup = {};
        const all = [];
        pool = new SimPool({ size: st.workers });
        const t0 = performance.now();
        let lastRender = 0;
        try {
            const results = await pool.run(ds, state.params, jobs, (p) => {
                bar.firstChild.style.width = (100 * p.doneGames / p.totalGames) + '%';
                const elapsed = (performance.now() - t0) / 1000;
                txt.textContent = `${p.doneGames} / ${p.totalGames} 场 · ${p.doneJobs}/${p.totalJobs} 任务 · ${elapsed.toFixed(1)}s · ${(p.doneGames / Math.max(elapsed, 0.001)).toFixed(0)} 场/s`;
                if (p.stats) {
                    byMatchup[p.stats.matchup] = mergeStats(byMatchup[p.stats.matchup], p.stats);
                    all.push(p.stats);
                    if (performance.now() - lastRender > 400) { lastRender = performance.now(); renderResults(cfg, byMatchup, all, false); }
                }
            });
            renderResults(cfg, byMatchup, all, true);
            state.lastBatch = { cfg, matrix: aggregateMatrix(byMatchup, SCHOOLS), global: aggregateGlobal(all), byMatchup, params: JSON.parse(JSON.stringify(state.params)), dataset: ds.name, version: ds.version, at: new Date().toISOString(), elapsedMs: performance.now() - t0 };
            toast(`完成 ${results.reduce((a, s) => a + s.games, 0)} 场，用时 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
        } catch (e) {
            console.error(e);
            toast('模拟出错：' + e.message);
        } finally {
            running = false;
            runBtn.disabled = false; cancelBtn.disabled = true;
            pool.terminate();
        }
    }

    function renderResults(cfg, byMatchup, all, final) {
        clear(resultBox);
        const matrix = aggregateMatrix(byMatchup, SCHOOLS);
        const glob = aggregateGlobal(all);
        const cellTitle = (a, b, c) => `${SCHOOL_NAMES[a]} vs ${SCHOOL_NAMES[b]}\n胜 ${c.wins} 负 ${c.losses} 平 ${c.draws}（超时 ${c.timeouts}）/ ${c.games}\n95% CI ${pct(c.ci[0], 0)} ~ ${pct(c.ci[1], 0)}\n平均 ${fmt(c.avgTurns / 2)} 回合`;

        // 热力图
        const table = h('table.heatmap');
        table.appendChild(h('tr', h('td.head', '行 vs 列'), ...SCHOOLS.map(s => h('td.head', { style: { color: SCHOOL_COLORS[s] } }, SCHOOL_NAMES[s])), h('td.head', '总胜率')));
        for (const a of SCHOOLS) {
            const tr = h('tr', h('td.head', { style: { color: SCHOOL_COLORS[a] } }, SCHOOL_NAMES[a]));
            for (const b of SCHOOLS) {
                const c = matrix.cells[a][b];
                tr.appendChild(h('td', { style: { background: c.games ? winColor(c.winRate) : '#222' }, title: cellTitle(a, b, c) },
                    c.games ? pct(c.winRate, 0) : '-', h('small', c.games ? `${c.games}场 · 平${pct(c.drawRate, 0)} · ${fmt(c.avgTurns / 2, 0)}回合` : '')));
            }
            const s = matrix.summary[a];
            tr.appendChild(h('td', { style: { background: winColor(s.winRate), fontWeight: 700 } }, pct(s.winRate, 1), h('small', `±${pct((s.ci[1] - s.ci[0]) / 2, 1)}`)));
            table.appendChild(tr);
        }

        // 汇总条
        const bars = h('div.bars');
        const order = SCHOOLS.slice().sort((x, y) => matrix.summary[y].winRate - matrix.summary[x].winRate);
        for (const s of order) {
            const sm = matrix.summary[s];
            bars.appendChild(h('div.bar',
                h('span', { style: { color: SCHOOL_COLORS[s] } }, SCHOOL_NAMES[s]),
                h('div.track', h('div.fill', { style: { width: pct(sm.winRate, 2), background: SCHOOL_COLORS[s] } }), h('div.ci', { style: { left: pct(sm.ci[0], 2), width: pct(sm.ci[1] - sm.ci[0], 2) } }), h('div.mid')),
                h('span.mono', `${pct(sm.winRate)} · ${fmt(sm.avgTurns / 2)}回合 · 平${pct(sm.drawRate, 0)}`),
            ));
        }
        const bal = matrix.balance;
        const verdict = bal.spread < 0.1 ? '均衡' : bal.spread < 0.2 ? '轻度失衡' : bal.spread < 0.35 ? '明显失衡' : '严重失衡';

        const unsupported = Object.entries(glob.total.unsupported);
        resultBox.appendChild(h('div.panel',
            h('h2', `结果 · ${cfg.mode} · ${glob.total.games} 场${final ? '' : '（进行中）'}`),
            h('div.cols',
                h('div', h('h3', '胜率矩阵（行方胜率）'), table),
                h('div', h('h3', '各系对外胜率（含 95% 置信区间）'), bars,
                    h('h3', '平衡度'),
                    h('div.small', `极差 ${pct(bal.spread)} · 标准差 ${pct(bal.std, 2)} · 判定：${verdict} · 先手胜率（有胜负局）${pct(bal.firstMoveWinRate)} · 平均 ${fmt(glob.avgTurns / 2)} 回合 · 失误率 ${pct(glob.fizzleRate)} · 跳过率 ${pct(glob.passRate)}（其中无牌 ${pct(glob.noCardPassRate)}）· 卡包打空 ${pct(glob.deckExhaustedRate)}`),
                ),
            ),
            h('div.row', { style: { marginTop: '10px' } },
                h('button', { onClick: () => download(`haqi_batch_${ds.version}_${cfg.mode}_${Date.now()}.json`, JSON.stringify({ cfg, dataset: ds.name, version: ds.version, params: state.params, matrix, global: glob }, null, 1)) }, '导出 JSON'),
                h('button', { onClick: () => download(`haqi_batch_${ds.version}_${cfg.mode}.csv`, toCsv(matrix), 'text/csv') }, '导出 CSV'),
                h('a', { href: '#advisor' }, h('button', '去 AI 建议 →')),
            ),
        ));

        // 卡牌统计与未支持
        const cardsTable = h('table');
        cardsTable.appendChild(h('tr', h('th', '卡牌'), h('th', '类型'), h('th', '使用次数'), h('th', '每场')));
        for (const [k, n] of glob.topCards.slice(0, 25)) {
            const c = ds.cards[k];
            cardsTable.appendChild(h('tr', h('td.mono', k), h('td', c ? c.type : '-'), h('td', n), h('td', fmt(n / Math.max(1, glob.total.games), 2))));
        }
        const dmgTable = h('table');
        dmgTable.appendChild(h('tr', h('th', '系'), h('th', '总伤害/场'), h('th', '总治疗/场')));
        for (const s of SCHOOLS) {
            const gamesOf = Object.values(byMatchup).filter(m => m.nearSchools.includes(s) || m.farSchools.includes(s)).reduce((a, m) => a + m.games, 0) || 1;
            dmgTable.appendChild(h('tr', h('td', { style: { color: SCHOOL_COLORS[s] } }, SCHOOL_NAMES[s]), h('td', fmt((glob.total.damageBySchool[s] || 0) / gamesOf, 0)), h('td', fmt((glob.total.healBySchool[s] || 0) / gamesOf, 0))));
        }
        resultBox.appendChild(h('div.panel',
            h('div.cols',
                h('div', h('h3', '使用最多的卡牌'), h('div.cardlist', cardsTable)),
                h('div', h('h3', '各系输出'), dmgTable,
                    h('h3', '未支持的卡牌类型'),
                    unsupported.length ? h('ul.small', ...unsupported.map(([t, r]) => h('li', h('span.mono', t), ` ×${r.count}：`, Object.keys(r.cards).slice(0, 6).join(', ')))) : h('div.muted.small', '无（预设卡组已过滤未支持类型）'),
                ),
            ),
        ));
    }

    function toCsv(matrix) {
        const lines = ['school,' + SCHOOLS.join(',') + ',overall,ci_lo,ci_hi,avg_rounds,draw_rate'];
        for (const a of SCHOOLS) {
            const s = matrix.summary[a];
            lines.push([a, ...SCHOOLS.map(b => (matrix.cells[a][b].winRate * 100).toFixed(2)), (s.winRate * 100).toFixed(2), (s.ci[0] * 100).toFixed(2), (s.ci[1] * 100).toFixed(2), (s.avgTurns / 2).toFixed(2), (s.drawRate * 100).toFixed(2)].join(','));
        }
        return lines.join('\n');
    }

    if (state.lastBatch && state.lastBatch.version === ds.version) {
        renderResults(state.lastBatch.cfg, state.lastBatch.byMatchup, Object.values(state.lastBatch.byMatchup), true);
    }
    return () => { if (pool && running) pool.cancel(); };
}
