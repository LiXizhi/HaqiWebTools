import { createSaveCommitter } from '../adventure_reward_persistence.js';
import { claimTreeMasteryRewards } from '../language_tree_rewards_core.js';
import { configureLearningReport } from '../learning/learning_report.js';
import { loadCourseCards, readPracticeCards } from '../learning/language_course.js';
import { mergeCurriculumWordCards } from '../language_curriculum_core.js';
import { wordLanguage } from '../word_lexicon_core.js';
import { configureLanguageTreeCapture } from '../learning/language_tree_capture.js';
import { openWordCardForCast } from '../learning/word_card_cast.js';
import { createWordCardPractice } from '../learning/word_card_practice.js';
import { createDictionaryStore } from '../learning/dictionary_store.js';
import { validateWordCards, makeWordCardSnapshot, activateWordCard, syncDictionaryQuestProgress } from '../word_cards_core.js';
import { resolveParams } from '../combat_params_core.js';
import { createHanziMemory } from '../hanzi/adventure_hanzi_memory.js';
import { hanziMemoryContext } from '../hanzi_island_scene_core.js';
import { DAILY_BUFF_NAMES } from '../language_daily_buff_core.js';
import { validTargets } from '../combat_arena_core.js';
import { castBlockedMessage } from '../adventure_cast_feedback_core.js';
import { restoreVisibleFocus } from '../ui/controls.js';
import { ensureStylesheet } from '../ui/dom.js';
import { renderOverlayCard } from '../views/adventure/view_panel_modal.js';

export function createWordLearningController({
    nodes,
    getContext,
    services,
    persist = services?.persistence?.persist,
    saveLocal = services?.persistence?.saveLocal,
    queueCloudSave = services?.persistence?.queueCloudSave,
    commitSave = services?.persistence?.commitSave,
    paintHud = services?.navigation?.paintHud,
    paintDialogue = services?.navigation?.paintDialogue,
    close = services?.navigation?.close,
    openPanel = services?.navigation?.openPanel,
    clearMovementPath,
    resetMovementInput,
    playRound,
    toast = services?.feedback?.toast,
    globalReward = services?.feedback?.globalReward,
    spellSound = services?.feedback?.spellSound,
    dialogueVoice,
}) {
    const saveCommitter = commitSave
        ? { commitSave }
        : createSaveCommitter({ getContext, saveLocal, queueCloudSave, paintHud });
    const dictionaryCardsStore = createDictionaryStore();
    const wordRecordings = new Map();
    const wordCardsByLanguage = new Map();
    let wordCardRows = null;
    let wordAudio = null;
    let wordAudioUrl = null;
    let dictionary = null;
    let dictionaryTicket = 0;

    const dictionaryCardKey = () => {
        const { roleStore } = getContext();
        return JSON.stringify([roleStore?.owner || 'guest', roleStore?.catalog.activeId]);
    };

    configureLearningReport(() => (getContext().roleStore?.catalog.activeId ? dictionaryCardKey() : null));
    configureLanguageTreeCapture(() => {
        const { roleStore, save } = getContext();
        return roleStore?.catalog.activeId
            ? { key: dictionaryCardKey(), privateNames: [save?.name, save?.pet?.name], onWarning: toast }
            : null;
    });

    async function loadWordCards() {
        const { save, assets } = getContext();
        const language = wordLanguage(save.languageLearning?.target || 'en');
        if (!wordCardsByLanguage.has(language)) {
            wordCardsByLanguage.set(
                language,
                (async () => {
                    const response = await fetch(new URL('../../data/adventure/dictionary/word-cards.json', import.meta.url));
                    if (!response.ok) throw Error('文字卡暂时无法加载');
                    const data = await response.json();
                    const extra = await loadCourseCards(data.cards[0].baseCardKey, language);
                    return validateWordCards(mergeCurriculumWordCards(data.cards, extra), assets.dataset.cards);
                })().catch(e => {
                    wordCardsByLanguage.delete(language);
                    throw e;
                }),
            );
        }
        wordCardRows = await wordCardsByLanguage.get(language);
        return wordCardRows;
    }

    function applyWordLearning(state) {
        const { save, assets } = getContext();
        if (syncDictionaryQuestProgress(save, assets.content, state)) {
            save.revision++;
            persist();
            queueCloudSave();
        }
    }

    function refreshWordGoals() {
        const { save, dialog } = getContext();
        const current = save;
        const key = dictionaryCardKey();
        void dictionaryCardsStore.read(key).then(state => {
            const latest = getContext();
            if (latest.save === current && dictionaryCardKey() === key) {
                applyWordLearning(state);
                paintHud();
                if (latest.dialog || dialog) paintDialogue();
            }
        }).catch(() => {});
    }

    const wordPractice = createWordCardPractice({
        getState: () => {
            const { save, assets, roleStore } = getContext();
            return {
                save,
                assets,
                content: assets?.content,
                owner: roleStore?.owner,
                role: roleStore?.catalog.activeId,
            };
        },
        onSaved: state => {
            const { save } = getContext();
            applyWordLearning(state);
            if (state.buff) save.dailyLanguageBuff = structuredClone(state.buff);
            persist();
            paintHud();
        },
        onPause: () => {
            resetMovementInput();
        },
    });

    function ensureWordStyle() {
        ensureStylesheet('word-practice-style', new URL('../../css/word-practice.css', import.meta.url).href);
    }

    async function openBattleWord(decision) {
        const { battle, save, stage, animation, discarded } = getContext();
        const current = battle;
        const currentSave = save;
        const turn = current?.turn;
        const hero = current?.sides.near[0];
        const row = hero?.wordCards?.[decision.seq];
        const isCurrent = pending => {
            const ctx = getContext();
            return ctx.battle === current
                && ctx.save === currentSave
                && ctx.stage === 'battle'
                && !ctx.animation
                && !current.finished
                && current.turn === turn
                && hero.deckMap[pending.seq] === 1
                && !ctx.discarded.includes(pending.seq)
                && hero.deckSeq[pending.seq] === pending.key
                && !castBlockedMessage(hero, current.resolved.cards[pending.key], current.resolved)
                && validTargets(current, hero, current.resolved.cards[pending.key]).some(t => t.id === pending.targetId);
        };
        if (!row || row.activated || wordPractice.active || !isCurrent(decision)) return;
        ensureWordStyle();
        await openWordCardForCast({
            practice: wordPractice,
            row,
            decision,
            isCurrent,
            onActivated: ({ audio }, pending) => {
                activateWordCard(hero, pending.seq);
                const snapshot = save.pendingEncounter.wordCards;
                if (!snapshot.activated.includes(row.id)) snapshot.activated.push(row.id);
                if (audio) wordRecordings.set(row.id, audio);
                persist();
            },
            cast: pending => playRound(pending),
        });
    }

    async function openIslandWord(id, done) {
        const { save, roleStore } = getContext();
        const current = save;
        const owner = roleStore?.owner;
        const role = roleStore?.catalog.activeId;
        try {
            const rows = await loadWordCards();
            const ctx = getContext();
            if (ctx.save !== current || ctx.roleStore?.owner !== owner || ctx.roleStore?.catalog.activeId !== role || ctx.stage !== 'world' || ctx.panel !== 'hanzi-memory') return;
            ensureWordStyle();
            const islandStory = hanziMemoryContext(ctx.assets?.content, id);
            await wordPractice.open(
                rows.find(r => r.language === 'zh' && r.entryId === id),
                () => {
                    done?.();
                    if (islandStory?.restored) {
                        toast(`已找回「${islandStory.glyph}」：${islandStory.restored}`);
                    }
                },
                () => close(),
                { islandStory },
            );
        } catch (error) {
            const ctx = getContext();
            if (ctx.save === current && ctx.roleStore?.owner === owner && ctx.roleStore?.catalog.activeId === role && ctx.panel === 'hanzi-memory') {
                toast(error.message);
                close();
            }
        }
    }

    function stopWordAudio() {
        if (wordAudio) {
            wordAudio.onended = null;
            wordAudio.onerror = null;
        }
        wordAudio?.pause();
        wordAudio = null;
        if (wordAudioUrl) URL.revokeObjectURL(wordAudioUrl);
        wordAudioUrl = null;
    }

    function playWordRecording(id) {
        stopWordAudio();
        const blob = wordRecordings.get(id);
        wordRecordings.delete(id);
        if (!blob || !spellSound.enabled) return;
        wordAudioUrl = URL.createObjectURL(blob);
        wordAudio = new Audio(wordAudioUrl);
        wordAudio.volume = spellSound.volume;
        wordAudio.onended = stopWordAudio;
        wordAudio.onerror = stopWordAudio;
        void wordAudio.play().catch(stopWordAudio);
    }

    function clearRecordings() {
        wordRecordings.clear();
    }

    function clearConsumedWordAudio() {
        const hero = getContext().battle?.sides.near[0];
        for (const id of wordRecordings.keys()) {
            if (!Object.entries(hero?.wordCards || {}).some(([seq, row]) => row.id === id && hero.deckMap[seq] === 1)) {
                wordRecordings.delete(id);
            }
        }
    }

    const hanziMemory = createHanziMemory({
        root: nodes.overlay,
        getState: () => {
            const { save, world, assets, stage, panel, roleStore } = getContext();
            return {
                save,
                world,
                content: assets?.content,
                stage,
                panel,
                owner: roleStore?.owner,
                role: roleStore?.catalog.activeId,
            };
        },
        persist: core => {
            persist();
            if (getContext().storageWarning) throw Error('文字记忆尚未保存，请重试。');
            if (core) queueCloudSave();
        },
        show: openMemory,
        close: () => close(),
        practice: (id, done) => void openIslandWord(id, done),
        toast,
    });

    function openMemory() {
        if (getContext().stage !== 'world') return;
        close({ silent: true });
        clearMovementPath();
        getContext().setPanel('hanzi-memory');
        nodes.hud.hidden = true;
        renderOverlayCard(nodes.overlay, '正在准备汉字练习…');
        void hanziMemory.open();
    }

    async function openDictionary(language = null, entryId = null, returnTarget = document.activeElement) {
        const ctx = getContext();
        if (ctx.stage !== 'world') return;
        close({ silent: true });
        clearMovementPath();
        ctx.setPanel('dictionary');
        nodes.hud.hidden = true;
        const ticket = ++dictionaryTicket;
        const role = ctx.roleStore.catalog.activeId;
        const owner = ctx.roleStore.owner;
        const fromToolbar = !!returnTarget?.closest?.('.dictionary-launch');
        const returnToScene = () => {
            close();
            const latest = getContext();
            if (latest.stage === 'world' && role === latest.roleStore.catalog.activeId && owner === latest.roleStore.owner) {
                restoreVisibleFocus(returnTarget, fromToolbar ? nodes.hud.querySelector('.dictionary-launch') : null, nodes.world);
            }
        };
        renderOverlayCard(nodes.overlay, '正在翻开字典…', [{ label: '返回', onClick: returnToScene }]);
        try {
            const module = await import('../learning/adventure_dictionary.js');
            const latest = getContext();
            if (ticket !== dictionaryTicket || role !== latest.roleStore.catalog.activeId || owner !== latest.roleStore.owner) return;
            ensureStylesheet('dictionary-style', new URL('../../css/dictionary.css', import.meta.url).href);
            dictionary = module.createDictionary({
                root: nodes.overlay,
                onLanguageTree: async (host, options) => {
                    const { mountDictionaryWordTree } = await import('../learning/word_tree_dictionary.js');
                    const key = dictionaryCardKey();
                    return mountDictionaryWordTree({
                        root: host,
                        key,
                        ...options,
                        secondaryLanguage: getContext().save.languageLearning?.target,
                        onConfirmed: (confirmedLanguage, words) => {
                            const nowCtx = getContext();
                            if (dictionaryCardKey() !== key || nowCtx.panel !== 'dictionary' || nowCtx.stage !== 'world') return;
                            const committed = saveCommitter.commitSave(
                                draft => claimTreeMasteryRewards(draft, confirmedLanguage, words),
                                { shouldSave: amount => amount > 0, mutateInPlace: true, paint: 'hud', setWarning: false },
                            );
                            if (!committed.skipped) toast(`已验证学会，兑换 ${committed.result} 奇豆`);
                        },
                        owner: getContext().roleStore.owner,
                        role: getContext().roleStore.catalog.activeId,
                        getKey: () => {
                            const nowCtx = getContext();
                            return nowCtx.panel === 'dictionary' && nowCtx.stage === 'world' ? dictionaryCardKey() : null;
                        },
                        online: () => !!getContext().roleStore.owner,
                        request: (messages, signal) => dialogueVoice.judge(messages, signal, { maxTokens: 2200 }),
                    });
                },
                loadBattleCards: loadWordCards,
                getState: () => {
                    const nowCtx = getContext();
                    return {
                        save: nowCtx.save,
                        assets: nowCtx.assets,
                        content: nowCtx.assets.content,
                        stage: nowCtx.stage,
                        owner: nowCtx.roleStore.owner,
                        role: nowCtx.roleStore.catalog.activeId,
                    };
                },
                onClose: returnToScene,
                onPractice: state => applyWordLearning(state),
                onRewards: () => openPanel('learning-mode'),
                onBuff: (buff, reward) => {
                    const nowCtx = getContext();
                    if (role !== nowCtx.roleStore.catalog.activeId || owner !== nowCtx.roleStore.owner) return;
                    nowCtx.save.dailyLanguageBuff = structuredClone(buff);
                    persist();
                    paintHud();
                    if (reward) {
                        globalReward.show({
                            title: '学习加成已生效',
                            lines: [
                                ['{name} +1%', { name: DAILY_BUFF_NAMES[reward.key] }],
                                ['今日累计 {total} 层', { total: reward.total }],
                            ],
                        });
                    }
                },
            });
            await dictionary.open(language || ({ en: 'en', ja: 'ja', ko: 'ko' }[getContext().save.languageLearning?.target] || 'zh'), entryId);
        } catch (error) {
            if (ticket === dictionaryTicket) {
                renderOverlayCard(nodes.overlay, error.message, [
                    { label: '重试', onClick: () => openDictionary(language, entryId, returnTarget) },
                    { label: '返回', onClick: returnToScene },
                ]);
            }
        }
    }

    function closeAll() {
        wordPractice.close();
        hanziMemory.close();
        dictionaryTicket++;
        dictionary?.close();
        dictionary = null;
    }

    function suspend() {
        dictionary?.suspend();
    }

    function tick() {
        dictionary?.tick();
    }

    function getWordCardRows() {
        return wordCardRows;
    }

    async function prepareBattleWordCards(startLanguage, isAlive) {
        const key = dictionaryCardKey();
        let learned = await dictionaryCardsStore.read(key);
        if (!isAlive()) return null;
        const rows = await loadWordCards();
        if (!isAlive()) return null;
        learned = await readPracticeCards(key, wordLanguage(startLanguage), learned, rows);
        return learned;
    }

    function attachBattleWordCards(pendingEncounter, learned, balanceParams, targetLanguage) {
        if (!learned || !pendingEncounter) return;
        const poolSize = resolveParams({ version: 'kids' }, balanceParams || {}, { groups: ['wordCards'] }).wordCards.poolSize;
        pendingEncounter.wordCards = makeWordCardSnapshot(learned, wordCardRows, pendingEncounter.seed, poolSize, targetLanguage);
    }

    return {
        wordPractice,
        hanziMemory,
        loadWordCards,
        refreshWordGoals,
        applyWordLearning,
        openBattleWord,
        openIslandWord,
        stopWordAudio,
        playWordRecording,
        clearRecordings,
        clearConsumedWordAudio,
        openMemory,
        openDictionary,
        prepareBattleWordCards,
        attachBattleWordCards,
        closeAll,
        suspend,
        tick,
        getWordCardRows,
    };
}
