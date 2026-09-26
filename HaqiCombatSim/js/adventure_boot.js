import { configureLocale, loadLocaleFiles } from './locale.js';
import { localeIdsToLoad, normalizeLocaleSave, isLocaleId } from './locale_core.js';
import { setText, tr } from './locale_runtime.js';

// Read only language preferences; full save validation remains in the app.
// The local display-language choice (homepage or settings) outranks the role save,
// so a title-screen pick survives reloads even before any world is entered.
export function readBootLocale(storage) {
    try {
        const pref = storage.getItem('haqi.locale.v1');
        const owner = storage.getItem('haqi.roles.last-account.v1');
        const raw = storage.getItem(`haqi.roles.v1.${owner ? 'account.' + encodeURIComponent(owner) : 'guest'}`);
        const catalog = raw ? JSON.parse(raw).catalog : null;
        const saved = catalog?.roles?.find(row => row.id === catalog.activeId)?.save
            || (!owner && !raw ? JSON.parse(storage.getItem('haqi.adventure.kids.v1') || 'null') : null);
        return normalizeLocaleSave({ locale: isLocaleId(pref) ? pref : saved?.locale, languageLearning: saved?.languageLearning });
    } catch { return normalizeLocaleSave({}); }
}

export async function bootAdventure() {
    let preferences;
    try { preferences = readBootLocale(localStorage); }
    catch { preferences = normalizeLocaleSave({}); }
    await loadLocaleFiles(localeIdsToLoad(preferences));
    configureLocale(preferences);
    document.documentElement.lang = preferences.locale;
    document.title = tr('魔法哈奇 · 初心之旅');
    const card = document.getElementById('boot-loading');
    setText(document.getElementById('load-title'), '魔法哈奇');
    setText(document.getElementById('load-caption'), '加载中…');
    setText(document.getElementById('load-status'), '正在准备你的魔法之旅…');
    document.getElementById('load-progress').setAttribute('aria-label', tr('正在准备游戏资源'));
    card.hidden = false;
    try { await import('./adventure_app.js'); }
    catch {
        card.setAttribute('aria-busy', 'false');
        setText(document.getElementById('load-status'), '冒险暂时无法开始');
        document.getElementById('load-progress').hidden = true;
        const retry = document.createElement('button');
        retry.className = 'primary';
        setText(retry, '重新尝试');
        retry.onclick = () => location.reload();
        card.append(retry);
    }
}

if (typeof document !== 'undefined') bootAdventure();
