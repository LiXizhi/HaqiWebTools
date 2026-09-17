// view_params.js — 数值面板：全局常量 / 各系系数 / 单卡覆盖 / diff / 导入导出。
import { state, setParams, updateParams, resetParams, subscribe } from './state.js';
import { SCHOOLS, defaultParams, diffParams, serializeParams, parseParams, cloneParams } from './combat_params_core.js';
import { baseMaxHp } from './combat_formulas_core.js';
import { SCHOOL_NAMES, SCHOOL_COLORS, defaultLevel } from './combat_presets_core.js';
import { isSupportedType } from './combat_cards_core.js';
import { h, clear, numberInput, download, readFileText, toast, fmt, debounce } from './utils.js';

const GLOBAL_DESC = {
    maxPips: '能量上限（player_server.lua L58/L173）',
    maxRounds: '最大半回合数（arena_server.lua L96/L319），到 0 判平局',
    handSize: '手牌上限（player_server.lua L295）',
    deckCapacity: '卡包总容量（卡包道具 stats[167]，arena_server.lua L8154；初始卡包 kids 14 / teen 18，正常玩家约 40）。配卡超出会被裁掉，卡包用完只能跳过；0 = 不限',
    deckEachCapacity: '单卡上限（stats[170]，arena_server.lua L8087；初始 3 / 5，正常约 6；teen 同名技能共享）；0 = 不限',
    deckPresetCopies: '未自定义配卡时，官方 Aggressive 卡组每种卡带几份（带满 40 张不一定最好——随机抽不到关键牌）',
    critDamageRatio: '暴击倍率（card_server.lua L96）',
    dodgeDamageRatio: '闪避后伤害倍率（card_server.lua L99/L191）',
    maxSpellPenetration: '穿透上限（card_server.lua L69）',
    protectRounds: 'kids PvP 绝对防御保护回合（card_server.lua L103）',
    arenaDamageBoostPerRound: '每满回合全场伤害加成 %（arena_server.lua L1405，kids 4 / teen 0）',
    healPenalty: '治疗惩罚 %（card_server.lua process_heal_penalty）',
    forceAccuracy100: 'teen 强制卡牌命中 100（勾选=true）',
    startupPipsNormal: '开局普通能量（对应装备 stat 184）',
    startupPipsPower: '开局强力能量（stat 185）',
};
const SCHOOL_FIELDS = [
    ['hp', 'HP 乘子', 0.05], ['damage', '伤害乘子', 0.05], ['heal', '治疗乘子', 0.05],
    ['accuracy', '命中 +%', 1], ['powerPip', '强力能量 +%', 1], ['resist', '抗性 +%', 1], ['crit', '暴击 +%', 1],
];

export function renderParams(main) {
    const ds = state.dataset;
    const root = h('div');
    main.appendChild(root);

    function draw() {
        clear(root);
        const P = state.params;
        const D = defaultParams(P.version);
        const diffs = diffParams(D, P);

        // ---- 全局 ----
        const grid = h('div.params-grid');
        for (const [k, v] of Object.entries(P.global)) {
            const changed = JSON.stringify(D.global[k]) !== JSON.stringify(v);
            let input;
            if (typeof v === 'boolean') input = h('input', { type: 'checkbox', checked: v, onChange: (e) => updateParams({ global: { [k]: e.target.checked } }) });
            else input = numberInput(v, (nv) => updateParams({ global: { [k]: nv ?? D.global[k] } }), { step: k.includes('Ratio') ? 0.05 : 1 });
            grid.appendChild(h('div.param', { class: changed ? 'changed' : '' }, h('label', k, changed ? h('span.muted', ` （默认 ${D.global[k]}）`) : null), input, h('div.desc', GLOBAL_DESC[k] || '')));
        }
        root.appendChild(h('div.panel',
            h('h2', `全局常量 · ${P.version}`),
            grid,
        ));

        // ---- 各系 ----
        const lvl = state.settings.batch.level || defaultLevel(P.version);
        const tbl = h('table');
        tbl.appendChild(h('tr', h('th', '系'), ...SCHOOL_FIELDS.map(([, label]) => h('th', label)), h('th', `Lv${lvl} 基础 HP → 生效 HP`)));
        for (const s of SCHOOLS) {
            const row = h('tr', h('td', { style: { color: SCHOOL_COLORS[s], fontWeight: 600 } }, SCHOOL_NAMES[s]));
            for (const [f, , step] of SCHOOL_FIELDS) {
                const v = P.perSchool[s][f];
                const changed = v !== D.perSchool[s][f];
                row.appendChild(h('td', { style: changed ? { background: 'rgba(232,176,74,.12)' } : {} }, numberInput(v, (nv) => updateParams({ perSchool: { [s]: { [f]: nv ?? D.perSchool[s][f] } } }), { step, style: { width: '70px' } })));
            }
            const base = baseMaxHp(s, lvl, P.version);
            row.appendChild(h('td.mono', `${base} → ${Math.ceil(base * P.perSchool[s].hp)}`));
            tbl.appendChild(row);
        }
        root.appendChild(h('div.panel', h('h2', '各系系数（叠加在原公式之上，1/0 为原版）'), tbl,
            h('div.muted.small', 'HP 乘子作用于 player_server.lua GetUpdatedMaxHP 曲线；命中/强力能量/抗性/暴击为加法百分点；治疗乘子换算为输出治疗加成。')));

        // ---- 公平模式 ----
        const fp = P.fairPlay || {};
        const fpOn = Boolean(P.fairPlay);
        root.appendChild(h('div.panel',
            h('h2', '公平模式（固定属性做纯卡牌对比）'),
            h('div.row',
                h('label', h('input', { type: 'checkbox', checked: fpOn, onChange: (e) => setParams({ ...cloneParams(P), fairPlay: e.target.checked ? { forceAccuracyBoost: null, forceDamageBoost: null, forceResist: null, forcePowerPipChance: null, forceAccuracy: null, maxHp: null } : null }) }), ' 启用'),
                ...['forceDamageBoost', 'forceResist', 'forceAccuracyBoost', 'forcePowerPipChance', 'forceAccuracy'].map(k => h('label', k, ' ', numberInput(fp[k] ?? '', (v) => setParams({ ...cloneParams(P), fairPlay: { ...fp, [k]: v } }), { disabled: !fpOn, placeholder: '不固定' }))),
            ),
            h('div.muted.small', 'forceDamageBoost/forceResist/forceAccuracyBoost 对应 Lua arena.force_damageboost 等强制值；forceAccuracy 直接固定最终命中率。留空表示不固定。'),
        ));

        // ---- 单卡 ----
        const search = h('input.card-search', { placeholder: '搜索卡牌 key（如 Fire_SingleAttack）' });
        const list = h('div.cardlist');
        const editor = h('div');
        const refreshList = () => {
            clear(list);
            const q = search.value.trim().toLowerCase();
            const keys = Object.keys(ds.cards).filter(k => !q || k.toLowerCase().includes(q)).slice(0, 60);
            const t = h('table');
            t.appendChild(h('tr', h('th', 'key'), h('th', '类型'), h('th', '费'), h('th', '命中'), h('th', '参数'), h('th', '')));
            for (const k of keys) {
                const c = ds.cards[k];
                const ov = P.cardOverrides[k];
                t.appendChild(h('tr', { style: ov ? { background: 'rgba(232,176,74,.12)' } : {} },
                    h('td.mono', k), h('td', c.type, isSupportedType(c.type) ? '' : h('span.muted', ' (未支持)')), h('td', c.pipcost), h('td', c.accuracy),
                    h('td.small.mono', Object.entries(c.params).filter(([pk]) => !/description|icon_gsid/.test(pk)).map(([pk, pv]) => `${pk}=${pv}`).join(' ')),
                    h('td', h('button', { onClick: () => editCard(k) }, ov ? '编辑*' : '编辑')),
                ));
            }
            list.appendChild(t);
        };
        const editCard = (k) => {
            clear(editor);
            const c = ds.cards[k];
            const ov = cloneParams(P.cardOverrides[k] || { params: {} });
            ov.params = ov.params || {};
            const fields = h('div.params-grid');
            const field = (label, cur, base, onChange) => h('div.param', { class: cur !== undefined && cur !== base ? 'changed' : '' }, h('label', label, h('span.muted', ` 原值 ${base}`)), numberInput(cur ?? base, onChange, { step: 'any' }));
            fields.appendChild(field('pipcost', ov.pipcost, c.pipcost, (v) => { ov.pipcost = v; }));
            fields.appendChild(field('accuracy', ov.accuracy, c.accuracy, (v) => { ov.accuracy = v; }));
            for (const [pk, pv] of Object.entries(c.params)) {
                if (typeof pv !== 'number') continue;
                fields.appendChild(field(pk, ov.params[pk], pv, (v) => { ov.params[pk] = v; }));
            }
            editor.appendChild(h('div.panel', h('h3', `编辑 ${k}`), fields, h('div.row',
                h('button.primary', { onClick: () => { const next = cloneParams(P); const clean = { params: {} }; if (ov.pipcost !== undefined && ov.pipcost !== c.pipcost) clean.pipcost = ov.pipcost; if (ov.accuracy !== undefined && ov.accuracy !== c.accuracy) clean.accuracy = ov.accuracy; for (const [pk, pv] of Object.entries(ov.params)) if (pv !== undefined && pv !== c.params[pk]) clean.params[pk] = pv; if (clean.pipcost === undefined && clean.accuracy === undefined && !Object.keys(clean.params).length) delete next.cardOverrides[k]; else next.cardOverrides[k] = clean; setParams(next); toast('已保存'); } }, '保存覆盖'),
                h('button', { onClick: () => { const next = cloneParams(P); delete next.cardOverrides[k]; setParams(next); } }, '清除该卡覆盖'),
            )));
        };
        search.addEventListener('input', debounce(refreshList, 150));
        refreshList();
        root.appendChild(h('div.panel', h('h2', `单卡覆盖（${Object.keys(P.cardOverrides).length} 张已覆盖）`), h('div.row', search), list, editor));

        // ---- diff / 导入导出 ----
        const diffEl = h('div.diff', ...(diffs.length ? diffs.map(d => h('div', h('span.path', d.path), h('span.from', String(d.from)), h('span.to', String(d.to)))) : [h('div.muted', '与默认一致')]));
        const ta = h('textarea', { rows: 8 }, serializeParams(P));
        root.appendChild(h('div.panel',
            h('h2', `与默认的差异（${diffs.length}）`), diffEl,
            h('div.row', { style: { marginTop: '10px' } },
                h('button', { onClick: () => download(`haqi_params_${P.version}.json`, serializeParams(P)) }, '导出 JSON'),
                h('label', h('button', { onClick: () => fileInput.click() }, '导入 JSON')),
                h('button', { onClick: () => { try { setParams(parseParams(ta.value, P.version)); toast('已应用'); } catch (e) { toast('JSON 解析失败：' + e.message); } } }, '应用下方文本'),
                h('button.danger', { onClick: () => { if (confirm('重置为默认参数？')) resetParams(); } }, '重置默认'),
            ),
            ta,
        ));
        const fileInput = h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; if (!f) return; try { setParams(parseParams(await readFileText(f), P.version)); toast('已导入'); } catch (err) { toast('导入失败：' + err.message); } } });
        root.appendChild(fileInput);
    }

    draw();
    const unsub = subscribe((what) => { if (what === 'params') draw(); });
    return unsub;
}
