// home/home_spell_summon_controller.js — 家园语音/文字咒语召唤、候选确认与练习事件入库。
import { compareDungeonSpeech } from '../dungeon_speech_core.js';
import { TEMPLATE_PRACTICE } from '../home_building_templates_core.js';
import { recordHomePractice } from '../home_practice.js';
import { chunkKey, matchHomeSpell, canPlace, footprint } from '../home_core.js';
import { starterLampExercise, matchStarterLampRequest } from '../home_starter_room_core.js';

export function createHomeSpellSummonController({
 check,
 valid,
 getHome,
 getSelection,
 getHero,
 parts,
 catalog,
 store,
 voice,
 abort,
 getView,
 getSpellEpoch,
 getBusy,
 setBusy,
 getCandidates,
 setCandidates,
 setStatus,
 setWish,
 setTranslation,
 getRecording,
 setRecording,
 at,
 currentObjects,
 placeTemplate,
 commit,
 emit,
 lang,
}) {
 let speechSession = null;
 let attempt = null;

 function matchSelectedHomeSpell(text, options) {
  const selection = getSelection();
  if (selection?.starterLamp && lang() === 'en') {
   const item = catalog.items.find(item => item.id === selection.itemId);
   return matchStarterLampRequest(text, item, selection, options);
  }
  return matchHomeSpell(text, [...catalog.items, ...TEMPLATE_PRACTICE], lang(), selection?.id ? null : selection, options);
 }

 async function summon(text, input) {
  if (!['zh', 'en'].includes(lang())) throw Error('目录咒语尚未收录此语言，请使用家园情境练习；已有物品仍可摆放。');
  if (getBusy()) throw Error('正在召唤，请稍候');
  check();
  const home = getHome(),
   selection = getSelection(),
   spellEpoch = getSpellEpoch();
  const key = JSON.stringify([home?.id, spellEpoch, selection?.itemId, selection?.color, lang()]);
  if (speechSession?.key !== key) speechSession = { key, count: 0 };
  if (input === 'speech' && /[\p{L}\p{N}]/u.test(text || '')) speechSession.count++;
  const result = matchSelectedHomeSpell(text, { input, speechAttempts: speechSession.count });
  getView().setSpeechFeedback(result.feedback);
  setCandidates([]);
  attempt = null;

  if (!result.candidates.length) throw Error(result.error);
  attempt = { receipt: crypto.randomUUID(), input, language: lang(), at: Date.now(), homeId: home?.id, selection, text };
  setCandidates(result.candidates);
  if (result.candidates.length > 1) {
   setStatus('请选择你想要的物品');
   emit();
   return;
  }
  await choose(result.candidates[0]);
 }

 async function choose(candidate) {
  check();
  const home = getHome(),
   selection = getSelection(),
   candidates = getCandidates();
  if (!attempt || home?.id !== attempt.homeId || selection !== attempt.selection) throw Error('召唤已过期，请重新说一句');
  if (!candidates.some(c => c.itemId === candidate.itemId && c.color === candidate.color)) throw Error('请重新完成召唤句子');
  if (getBusy()) return;
  setBusy(true);
  try {
   const view = getView();
   const original = [...catalog.items, ...TEMPLATE_PRACTICE].find(i => i.id === candidate.itemId);
   const starterLamp = selection?.starterLamp === true && attempt.language === 'en';
   const item = starterLamp ? starterLampExercise(original) : original;
   attempt.practiceValid =
    compareDungeonSpeech(attempt.text, item[attempt.language === 'en' ? 'en' : 'zh'], attempt.language === 'en' ? 'en' : 'zh-CN')
     .accuracy === 1;
   const template = TEMPLATE_PRACTICE.find(i => i.id === candidate.itemId);
   if (template) {
    const placedAt = await placeTemplate(template.templateId, attempt);
    attempt = null;
    speechSession = null;
    view.setInput('');
    view.closeSummon();
    if (placedAt) view.celebrateSummon?.(placedAt);
    return;
   }
   const object = spellPlacement(candidate);
   const practice = attempt.practiceValid
    ? {
       id: attempt.receipt,
       input: attempt.input,
       itemId: candidate.itemId,
       language: attempt.language,
       at: attempt.at,
       ...(starterLamp ? { starterLamp: true } : {}),
      }
    : null;
   await commit({ type: 'summon', ...candidate, receipt: attempt.receipt, input: attempt.input, object, practice });
   attempt = null;
   speechSession = null;
   if (starterLamp) {
    setStatus('灯亮了。按住灯，可以给它换个位置。');
    setWish(null);
    setTranslation(false);
    emit();
   }
   view.setInput('');
   view.closeSummon(starterLamp);
   const b = footprint(object, catalog.items);
   view.celebrateSummon?.({ x: b.x + b.w / 2, y: b.y + b.h * 0.75, w: b.w, h: b.h });
  } finally {
   setBusy(false);
  }
 }

 async function drainPractice(id) {
  if (!store.updateLocal) return;
  const queued = await store.read(id, 'local:practice');
  for (const event of Object.values(queued)) {
   if (!valid() || getHome()?.id !== id) return;
   const item = [...catalog.items, ...TEMPLATE_PRACTICE].find(i => i.id === event.itemId);
   const recorded = await recordHomePractice(
    { ...event, item: event.starterLamp ? starterLampExercise(item) : item },
    () => valid() && getHome()?.id === id,
   );
   if (recorded === false) return;
   if (!valid() || getHome()?.id !== id) return;
   await store.updateLocal(id, 'local:practice', rows => {
    delete rows[event.id];
   });
  }
 }

 function spellPlacement(candidate) {
  const selection = getSelection(),
   hero = getHero();
  const fixed = selection?.spellPosition;
  const positions = fixed
   ? [fixed]
   : Array.from({ length: 81 }, (_, i) => ({ x: hero.x + 2 + (i % 9) * 2, y: hero.y - 8 + Math.floor(i / 9) * 2 })).sort(
      (a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y),
     );
  for (const p of positions) {
   if (!Object.hasOwn(parts, `chunk:${chunkKey(p.x, p.y)}`)) continue;
   const obj = at(candidate.itemId, p, { color: candidate.color });
   if (canPlace(obj, currentObjects(), catalog.items).ok) return obj;
  }
  throw Error('这里放不下，请从建造目录拖到一处空地，再念咒语。');
 }

 async function record() {
  check();
  if (getRecording()) return;
  const home = getHome(),
   selection = getSelection(),
   spellEpoch = getSpellEpoch();
  const token = { id: home?.id, epoch: spellEpoch, selection, language: lang(), color: selection?.color, starting: null };
  setRecording(token);
  setStatus('正在准备麦克风…');
  emit();
  token.starting = voice.start(abort.signal, {
   onPartial: text => {
    if (
     getRecording() === token &&
     valid() &&
     token.epoch === getSpellEpoch() &&
     token.selection === getSelection() &&
     token.language === lang() &&
     token.color === getSelection()?.color
    ) {
     getView().setSpeechFeedback(matchSelectedHomeSpell(text).feedback);
    }
   },
  });
  try {
   await token.starting;
   if (getRecording() === token && valid()) {
    setStatus('正在听，松开后召唤');
    emit();
   }
  } catch (e) {
   if (getRecording() === token) setRecording(null);
   throw e;
  }
 }

 async function finish() {
  const token = getRecording();
  if (!token) return;
  await token.starting;
  if (getRecording() !== token || !valid()) return;
  if (token.finishing) return;
  token.finishing = true;
  let text;
  try {
   text = await voice.finish();
  } catch (e) {
   if (getRecording() === token) setRecording(null);
   throw e;
  }
  if (getRecording() !== token) return;
  setRecording(null);
  if (
   token.epoch !== getSpellEpoch() ||
   token.id !== getHome()?.id ||
   !valid() ||
   token.selection !== getSelection() ||
   token.language !== lang() ||
   token.color !== getSelection()?.color
  )
   return;
  await summon(text, 'speech');
 }

 return {
  matchSelectedHomeSpell,
  summon,
  choose,
  drainPractice,
  spellPlacement,
  record,
  finish,
 };
}
