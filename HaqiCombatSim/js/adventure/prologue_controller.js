import { isLocaleId } from '../locale_core.js';
import { loadLocaleFiles, configureLocale, displayLocale } from '../locale.js';
import { LOCALE_PREF_KEY, rememberSecondLocale } from './locale_prefs.js';

// Prologue 《失落的光》 (docs/prologue.md): lazily loaded, shares loaded assets and locale, needs no login
// and never writes a role save. First-time players see it before character creation.
export function createPrologueController({ getContext, secondLocaleFor, toast }) {
    let prologueRun = null;
    let prologueOffered = false;

    async function setPrologueLocale(native, target) {
        if (!isLocaleId(native)) return;
        try {
            localStorage.setItem(LOCALE_PREF_KEY, native);
        } catch {
            /* ignore */
        }
        if (isLocaleId(target) && target !== native) rememberSecondLocale(target);
        await loadLocaleFiles([native, target].filter(id => isLocaleId(id) && id !== 'zh-CN'));
        const { save } = getContext();
        configureLocale({ locale: native, languageLearning: { ...(save?.languageLearning || {}), native, target } });
        document.documentElement.lang = native;
    }

    function runPrologue({ fromUrl = false, scene = null, lang = null, second = null } = {}) {
        if (prologueRun) return prologueRun;
        prologueOffered = true;
        const native = isLocaleId(lang) ? lang : displayLocale();
        const target = isLocaleId(second) && second !== native ? second : secondLocaleFor(native);
        prologueRun = (async () => {
            try {
                if (lang && lang !== displayLocale()) await setPrologueLocale(native, target);
                const { mountPrologue } = await import('../prologue_app.js');
                const { assets, renderer, spellSound } = getContext();
                const handle = await mountPrologue(document.body, {
                    assets,
                    renderer,
                    spellSound,
                    locale: native,
                    second: target,
                    start: scene,
                    onLocaleChange: setPrologueLocale,
                });
                return await handle.exited;
            } catch (error) {
                console.error('序章加载失败', error);
                document.querySelector('.prologue-layer')?.remove();
                toast('序章暂时无法播放，可以直接开始冒险。');
                return null;
            } finally {
                prologueRun = null;
                if (fromUrl) {
                    const url = new URL(location.href);
                    for (const key of ['prologue', 'scene', 'lang', 'second']) url.searchParams.delete(key);
                    history.replaceState(history.state, '', url);
                }
            }
        })();
        return prologueRun;
    }

    function isRunning() {
        return !!prologueRun;
    }

    function wasOffered() {
        return prologueOffered;
    }

    return {
        setPrologueLocale,
        runPrologue,
        isRunning,
        wasOffered,
    };
}
