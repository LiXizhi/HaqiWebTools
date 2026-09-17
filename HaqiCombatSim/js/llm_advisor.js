// llm_advisor.js — 大模型建议：把批量结果 + 当前参数组织成提示词，调用 OpenAI 兼容 chat/completions，
// 解析回复中的 ```json 参数补丁块。不含 DOM。
import { SCHOOLS, defaultParams, diffParams } from './combat_params_core.js';
import { SCHOOL_NAMES } from './combat_presets_core.js';

const p1 = (v) => (v * 100).toFixed(1) + '%';

/**
 * @param batch state.lastBatch：{ cfg, matrix, global, params, version, dataset }
 * @param dataset 用于卡牌类型说明
 */
export function buildPrompt(batch, dataset, extraNotes = '') {
    const { matrix, global: glob, cfg, params, version } = batch;
    const lines = [];
    lines.push(`你是《魔法哈奇》回合制卡牌 PvP 的数值策划助手。下面是 ${version} 版、${cfg.mode} 模式、每组 ${cfg.games} 场的 Monte-Carlo 模拟结果（双方均为官方 AI 卡组权重 Bot，等级 ${cfg.level}）。`);
    lines.push('');
    lines.push('## 胜率矩阵（行方胜率，已合并先后手）');
    lines.push('| 行\\列 | ' + SCHOOLS.map(s => SCHOOL_NAMES[s]).join(' | ') + ' | 对外总胜率 | 95%CI | 平局率 | 平均回合 |');
    lines.push('|' + '---|'.repeat(SCHOOLS.length + 5));
    for (const a of SCHOOLS) {
        const s = matrix.summary[a];
        lines.push(`| ${SCHOOL_NAMES[a]} | ` + SCHOOLS.map(b => p1(matrix.cells[a][b].winRate)).join(' | ') + ` | ${p1(s.winRate)} | ${p1(s.ci[0])}~${p1(s.ci[1])} | ${p1(s.drawRate)} | ${(s.avgTurns / 2).toFixed(1)} |`);
    }
    lines.push('');
    lines.push(`平衡度：极差 ${p1(matrix.balance.spread)}，标准差 ${p1(matrix.balance.std)}，先手胜率（有胜负局）${p1(matrix.balance.firstMoveWinRate)}，整体平均 ${(glob.avgTurns / 2).toFixed(1)} 回合，失误率 ${p1(glob.fizzleRate)}，跳过率 ${p1(glob.passRate)}（无牌跳过 ${p1(glob.noCardPassRate || 0)}），单位打空卡包比例 ${p1(glob.deckExhaustedRate || 0)}。`);
    lines.push('');
    lines.push('## 各系每场输出 / 治疗');
    for (const s of SCHOOLS) lines.push(`- ${SCHOOL_NAMES[s]}：伤害 ${Math.round((glob.total.damageBySchool[s] || 0) / Math.max(1, glob.total.games / SCHOOLS.length * 2))}，治疗 ${Math.round((glob.total.healBySchool[s] || 0) / Math.max(1, glob.total.games / SCHOOLS.length * 2))}`);
    lines.push('');
    lines.push('## 使用最多的卡牌（前 20）');
    for (const [k, n] of glob.topCards.slice(0, 20)) {
        const c = dataset && dataset.cards[k];
        lines.push(`- ${k}（${c ? c.type + ' ' + c.pipcost + '费 命中' + c.accuracy + ' ' + JSON.stringify(Object.fromEntries(Object.entries(c.params).filter(([pk]) => !/description|icon_gsid/.test(pk)))) : ''}）×${n}`);
    }
    lines.push('');
    const diffs = diffParams(defaultParams(version), params);
    lines.push('## 当前参数相对原版的修改');
    lines.push(diffs.length ? diffs.map(d => `- ${d.path}: ${JSON.stringify(d.from)} → ${JSON.stringify(d.to)}`).join('\n') : '- 无（原版数值）');
    lines.push('');
    lines.push('## 可调参数说明');
    lines.push('- perSchool.<school>.hp：该系最大 HP 乘子（1 = 原版曲线）');
    lines.push('- perSchool.<school>.heal：治疗乘子；accuracy / powerPip / resist / crit：加法百分点');
    lines.push('- global.maxRounds（半回合上限）、global.critDamageRatio、global.arenaDamageBoostPerRound（每回合全场伤害加成%）、global.healPenalty（治疗惩罚%）');
    lines.push('- cardOverrides.<CardKey>：{ pipcost, accuracy, params: { damage_min, damage_max, heal_min, heal_max, dots, ... } } 单卡数值');
    lines.push('');
    lines.push('机制提示：五系无相克表；平衡完全由 HP 曲线、卡牌数值、charm/ward（blade/trap/shield）与能量经济决定。寒冰 HP 高、风暴伤害高命中低、生命有治疗、死亡有吸血、烈火有 DOT。平局多说明治疗/防御过强或回合上限太短。');
    if (extraNotes) { lines.push(''); lines.push('## 策划补充'); lines.push(extraNotes); }
    lines.push('');
    lines.push('请：1) 用中文分析失衡原因（结合矩阵中的具体对局）；2) 给出 3~6 条具体、保守（单次调整幅度 ≤15%）的调整建议并说明预期影响；3) 最后输出一个 ```json 代码块，内容是可直接合并的参数补丁，格式如 {"perSchool": {"fire": {"hp": 1.1}}, "global": {}, "cardOverrides": {"Fire_SingleAttack_Level5": {"params": {"damage_min": 600}}}}。只输出一个 json 块。');
    return lines.join('\n');
}

/**
 * 调用 OpenAI 兼容接口
 * @param cfg { endpoint, apiKey, model, temperature }
 * @return 文本
 */
export async function requestAdvice(cfg, prompt, signal) {
    const body = {
        model: cfg.model || 'gpt-4o-mini',
        temperature: cfg.temperature ?? 0.3,
        messages: [
            { role: 'system', content: '你是资深 MMORPG 数值策划，擅长回合制卡牌 PvP 平衡。回答简洁、可执行、有数据依据。' },
            { role: 'user', content: prompt },
        ],
    };
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
    const res = await fetch(cfg.endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('响应中没有 choices[0].message.content');
    return content;
}

/** 解析回复中的 ```json ... ``` 参数补丁（取最后一个可解析的块） */
export function parseParamPatch(text) {
    const blocks = [...String(text).matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map(m => m[1].trim());
    for (let i = blocks.length - 1; i >= 0; i--) {
        try {
            const obj = JSON.parse(blocks[i]);
            if (obj && typeof obj === 'object' && (obj.perSchool || obj.global || obj.cardOverrides)) return sanitizePatch(obj);
        } catch { /* try next */ }
    }
    // 裸 JSON
    const m = /\{[\s\S]*\}/.exec(text);
    if (m) { try { const obj = JSON.parse(m[0]); if (obj.perSchool || obj.global || obj.cardOverrides) return sanitizePatch(obj); } catch { /* ignore */ } }
    return null;
}

function sanitizePatch(obj) {
    const out = {};
    if (obj.perSchool && typeof obj.perSchool === 'object') {
        out.perSchool = {};
        for (const [s, v] of Object.entries(obj.perSchool)) {
            if (!SCHOOLS.includes(s) || typeof v !== 'object') continue;
            out.perSchool[s] = {};
            for (const [k, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n)) out.perSchool[s][k] = n;
        }
    }
    if (obj.global && typeof obj.global === 'object') {
        out.global = {};
        for (const [k, n] of Object.entries(obj.global)) if ((typeof n === 'number' && Number.isFinite(n)) || typeof n === 'boolean') out.global[k] = n;
    }
    if (obj.cardOverrides && typeof obj.cardOverrides === 'object') {
        out.cardOverrides = {};
        for (const [k, v] of Object.entries(obj.cardOverrides)) {
            if (!v || typeof v !== 'object') continue;
            const o = {};
            if (typeof v.pipcost === 'number') o.pipcost = v.pipcost;
            if (typeof v.accuracy === 'number') o.accuracy = v.accuracy;
            if (v.params && typeof v.params === 'object') { o.params = {}; for (const [pk, pv] of Object.entries(v.params)) if (typeof pv === 'number' || typeof pv === 'string') o.params[pk] = pv; }
            out.cardOverrides[k] = o;
        }
    }
    return out;
}

/** 无 LLM 时的规则化建议文本（与 tuner 配合） */
export function heuristicAdvice(batch) {
    const { matrix } = batch;
    const lines = [];
    const sorted = SCHOOLS.slice().sort((a, b) => matrix.summary[b].winRate - matrix.summary[a].winRate);
    lines.push(`最强：${SCHOOL_NAMES[sorted[0]]}（${p1(matrix.summary[sorted[0]].winRate)}），最弱：${SCHOOL_NAMES[sorted[sorted.length - 1]]}（${p1(matrix.summary[sorted[sorted.length - 1]].winRate)}），极差 ${p1(matrix.balance.spread)}。`);
    const patch = { perSchool: {} };
    for (const s of SCHOOLS) {
        const r = matrix.summary[s].winRate;
        const d = matrix.summary[s].drawRate;
        if (Math.abs(r - 0.5) < 0.05) continue;
        const f = Math.round((1 + (0.5 - r) * 0.6) * 100) / 100;
        patch.perSchool[s] = { hp: Math.round(((batch.params.perSchool[s].hp || 1) * f) * 1000) / 1000 };
        lines.push(`- ${SCHOOL_NAMES[s]} 对外胜率 ${p1(r)}${d > 0.2 ? `（平局 ${p1(d)}，偏防御/治疗）` : ''} → 建议 HP 乘子 ×${f}（→ ${patch.perSchool[s].hp}）`);
    }
    const worstCells = [];
    for (const a of SCHOOLS) for (const b of SCHOOLS) if (a !== b) worstCells.push({ a, b, r: matrix.cells[a][b].winRate });
    worstCells.sort((x, y) => Math.abs(y.r - 0.5) - Math.abs(x.r - 0.5));
    lines.push('最极端对局：' + worstCells.slice(0, 3).map(c => `${SCHOOL_NAMES[c.a]} vs ${SCHOOL_NAMES[c.b]} ${p1(c.r)}`).join('；'));
    if (matrix.balance.firstMoveWinRate !== null && Math.abs(matrix.balance.firstMoveWinRate - 0.5) > 0.05) lines.push(`先手胜率 ${p1(matrix.balance.firstMoveWinRate)}，先后手影响显著。`);
    return { text: lines.join('\n'), patch };
}
