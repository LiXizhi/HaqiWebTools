import { isLocaleId } from '../locale_core.js';

export const LOCALE_PREF_KEY = 'haqi.locale.v1';
export const SECOND_LOCALE_KEY = 'haqi.locale.second.v1';

export function storedLocalePref() {
    try {
        const pref = localStorage.getItem(LOCALE_PREF_KEY);
        return isLocaleId(pref) ? pref : null;
    } catch {
        return null;
    }
}

export function storedSecondLocale() {
    try {
        const pref = localStorage.getItem(SECOND_LOCALE_KEY);
        return isLocaleId(pref) ? pref : null;
    } catch {
        return null;
    }
}

export function rememberSecondLocale(locale) {
    try {
        localStorage.setItem(SECOND_LOCALE_KEY, locale);
    } catch {
        /* ignore */
    }
}

// 未单独选过时默认 English；与母语相同时改为另一种。
export function secondLocaleFor(native, save = null) {
    const pref = storedSecondLocale();
    if (pref && pref !== native) return pref;
    const saved = save?.languageLearning?.target;
    if (isLocaleId(saved) && saved !== native) return saved;
    return native === 'en' ? 'zh-CN' : 'en';
}
