// Presentation metadata only; no browser IO, game rules or random state.
export function atlasRect(sheet, index) {
    if (!Number.isInteger(index) || index < 0 || index >= sheet.columns * sheet.rows) throw new Error('技能图集格号无效');
    const w = sheet.width / sheet.columns, h = sheet.height / sheet.rows;
    return [index % sheet.columns * w, Math.floor(index / sheet.columns) * h, w, h];
}
export function skillFrame(manifest, base, progress = null) {
    const entry = manifest.bases[base];
    if (!entry) throw new Error('缺少技能主体：' + base);
    const hero = !!entry.effectAtlas;
    const atlas = hero ? entry.effectAtlas : entry.atlas;
    const index = hero ? (progress === null ? entry.heroCardFrame : entry.effectFrames[Math.min(entry.effectFrames.length - 1, Math.floor(Math.max(0, Math.min(1, progress)) * entry.effectFrames.length))]) : entry.cell;
    return {atlas, rect: atlasRect(manifest.sheets[atlas], index), hero};
}
export function validateSkillArt(manifest, effects) {
    if (manifest?.version !== 1 || manifest.maxBytes !== 100000 || !manifest.sheets || !manifest.bases) throw new Error('技能美术清单版本无效');
    for (const [id, sheet] of Object.entries(manifest.sheets)) {
        if (!Number.isInteger(sheet.size) || sheet.size <= 0 || sheet.size > 100000 || !/^[a-f0-9]{64}$/.test(sheet.sha256)) throw new Error('技能图集预算或哈希无效：' + id);
        if (![sheet.width,sheet.height,sheet.columns,sheet.rows].every(n=>Number.isInteger(n)&&n>0) || sheet.width % sheet.columns || sheet.height % sheet.rows) throw new Error('技能图集尺寸无效：' + id);
    }
    for (const base of Object.keys(effects.bases)) {
        const entry = manifest.bases[base];
        if (!entry || !manifest.sheets[entry.atlas]) throw new Error('缺少技能主体：' + base);
        atlasRect(manifest.sheets[entry.atlas], entry.cell);
        if (entry.effectAtlas) {
            if (!manifest.sheets[entry.effectAtlas] || !Array.isArray(entry.effectFrames) || entry.effectFrames.length !== 9) throw new Error('专属技能动作帧无效：' + base);
            for (const index of [...entry.effectFrames, entry.heroCardFrame]) atlasRect(manifest.sheets[entry.effectAtlas], index);
        }
        skillFrame(manifest, base);
    }
    return Object.keys(effects.bases).length;
}
