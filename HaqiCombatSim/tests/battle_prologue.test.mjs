import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadDataset} from '../js/data_core.js';
import {defaultParams} from '../js/combat_params_core.js';
import {
  validateScript,
  languagePair,
  bilingual,
  prologueRequested,
  readSeconds,
  beatAutoSeconds,
  createRunner,
  SCHOOL_IDS,
} from '../js/prologue_script_core.js';
import {
  MASTERS_SEED,
  FINALE_SEED,
  MASTERS_ORDER,
  MASTER_SHOWCASE_CHOICES,
  createMastersArena,
  wizardAttackHand,
  mastersResolve,
  wordCardRow,
  wordCardInHand,
  createFinaleArena,
  finaleResolve,
} from '../js/prologue_battle_core.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJsonSync = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const readJsonAsync = async rel => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const script = readJsonSync('data/prologue/script.json');
const artManifest = readJsonSync('data/prologue/art.json');
const dictionary = readJsonSync('data/adventure/dictionary/word-cards.json');
const dataset = await loadDataset('data/kids', readJsonAsync);
const params = defaultParams('kids');
const speakerNames = Object.fromEntries(
  Object.entries(script.speakers).map(([id, row]) => [id, row['zh-CN']]),
);

test('序章 *_core.js 保持纯净，不引用 document / window / fetch', () => {
  for (const rel of ['js/prologue_script_core.js', 'js/prologue_battle_core.js']) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/\b(document|window|fetch)\b/.test(source), false, `${rel} 不得引用浏览器全局对象`);
  }
});

test('序章剧本与美术清单完整性校验、全对话具名NPC头像、双语配对与状态机推进', () => {
  const valid = validateScript(script, {artIds: new Set(Object.keys(artManifest.entries))});
  assert.equal(valid.scenes.length, 8);
  for (const scene of valid.scenes) {
    for (const beat of scene.beats) {
      assert.notEqual(beat.type, 'choose-school', '序章不应再包含学系与性别选择镜头');
      if (beat.type === 'line') {
        assert.notEqual(beat.speaker, 'narrator', `${scene.id} 对话必须绑定具名NPC以显示头像`);
      }
    }
  }
  assert.deepEqual(languagePair('zh-CN', 'en'), {native: 'zh-CN', target: 'en'});
  assert.deepEqual(languagePair('en', null), {native: 'en', target: 'zh-CN'});
  assert.deepEqual(languagePair('zh-CN', 'zh-CN'), {native: 'zh-CN', target: 'en'});
  assert.deepEqual(
    bilingual({'zh-CN': '光', en: 'light'}, languagePair('en', 'zh-CN')),
    {primary: 'light', secondary: '光'},
  );
  assert.deepEqual(prologueRequested('?prologue=1&lang=en&second=zh-CN&scene=light'), {
    scene: 'light',
    lang: 'en',
    second: 'zh-CN',
  });
  assert.equal(prologueRequested('?zone=camp'), null);
  assert.ok(readSeconds({'zh-CN': '光被夺走了。', en: 'The Light has been stolen.'}, languagePair('zh-CN', 'en')) >= 2.4);
  assert.equal(beatAutoSeconds({type: 'title', text: {'zh-CN': '序章', en: 'Prologue'}}, languagePair('zh-CN', 'en')), 1.8);

  const runner = createRunner(script, {start: 'steal-light'});
  assert.equal(runner.current().scene, 'steal-light');
  assert.equal(runner.current().beatIndex, 0);
  runner.next();
  assert.equal(runner.current().beatIndex, 1);
  runner.skipScene();
  assert.equal(runner.current().scene, 'masters-battle');
  assert.equal(runner.artAt().art, 'camp-night-battle-bg');
  runner.skipAll();
  assert.equal(runner.current().beat.type, 'end');
  runner.next();
  assert.equal(runner.done, true);

  const bad = structuredClone(script);
  delete bad.scenes[0].beats.find(b => b.type === 'line').text.en;
  assert.throws(() => validateScript(bad), /序章剧本无效/);
});

test('序章 12 张 WebP 插画（含带翅膀黑暗魔王立绘）体积 < 200KB 且哈希与清单一致', () => {
  assert.equal(artManifest.version, 1);
  const entries = Object.entries(artManifest.entries);
  assert.equal(entries.length, 12);
  assert.ok(artManifest.entries['dark-lord-boss'], '应包含带翅膀的黑暗魔王独立 WebP');
  for (const [id, entry] of entries) {
    const file = path.join(root, entry.local);
    assert.equal(fs.existsSync(file), true, `缺少插画文件 ${entry.local}`);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.length, entry.size, `${id} 字节数不匹配`);
    assert.ok(bytes.length < 200000, `${id} 超过 200KB 上限: ${bytes.length}`);
    assert.equal(new URL(entry.cdn).origin, 'https://cdn.keepwork.com', `${id} 缺少永久 CDN 地址`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha, entry.sha256, `${id} sha256 不匹配`);
  }
});

test('第一幕 4v1 依次为四位大师从新手指引3张代表技能中选卡：81种全组合四人均施法、确定性获胜、0失误', () => {
  for (const c0 of MASTER_SHOWCASE_CHOICES['master-fire']) {
    for (const c1 of MASTER_SHOWCASE_CHOICES.hero) {
      for (const c2 of MASTER_SHOWCASE_CHOICES['master-storm']) {
        for (const c3 of MASTER_SHOWCASE_CHOICES['master-life']) {
          const picks = {
            'master-fire': c0,
            hero: c1,
            'master-storm': c2,
            'master-life': c3,
          };
          const a1 = createMastersArena(dataset, params, {names: speakerNames, seed: MASTERS_SEED});
          const a2 = createMastersArena(dataset, params, {names: speakerNames, seed: MASTERS_SEED});
          assert.deepEqual(a1.sides.near.map(u => u.name), ['烈火大师', '寒冰大师', '风暴大师', '生命大师']);
          assert.equal(a1.sides.far[0].name, '黑暗魔王');
          assert.equal(a1.sides.far[0].school, 'death');

          for (const unitId of MASTERS_ORDER) {
            const hand = wizardAttackHand(a1, unitId);
            assert.equal(hand.length, 3, `${unitId} 应有新手指引中的3张代表技能卡`);
            assert.deepEqual(hand.map(h => h.key), MASTER_SHOWCASE_CHOICES[unitId]);
          }

          const res1 = mastersResolve(a1, picks);
          const res2 = mastersResolve(a2, picks);
          const frames1 = res1.flatMap(g => g.frames);
          const frames2 = res2.flatMap(g => g.frames);
          assert.equal(a1.winner, 'near', `${JSON.stringify(picks)} 应由四位大师获胜`);
          assert.equal(a1.turn, 2, `${JSON.stringify(picks)} 应在第2回合结算`);
          assert.equal(frames1.filter(f => f.event.type === 'fizzle').length, 0, `${JSON.stringify(picks)} 不应出现失误`);
          assert.equal(Object.keys(a1.unsupported || {}).length, 0);

          const casts1 = frames1.filter(f => f.event.type === 'cast');
          const casts2 = frames2.filter(f => f.event.type === 'cast');
          assert.deepEqual(
            casts1.map(f => f.event.caster),
            ['dark-lord', ...MASTERS_ORDER],
            `${JSON.stringify(picks)} 四位大师均应完整施放各自所选技能`,
          );
          assert.deepEqual(
            casts1.map(f => [f.event.caster, f.event.card, f.event.target]),
            casts2.map(f => [f.event.caster, f.event.card, f.event.target]),
          );
        }
      }
    }
  }
});

test('第三幕与第四幕 4v2 再战：四位大师每人持有3张代表技能卡+文字卡（共4张），全员施法获胜且0失误', () => {
  assert.equal(wordCardRow(dictionary.cards, 'zh-CN').id, 'zh:guang');
  assert.equal(wordCardRow(dictionary.cards, 'en').id, 'en:sun');

  for (const targetLang of ['zh-CN', 'en']) {
    const wordCard = wordCardRow(dictionary.cards, targetLang);
    const arena = createFinaleArena(dataset, params, {
      names: speakerNames,
      wordCard,
      seed: FINALE_SEED,
    });
    assert.deepEqual(arena.sides.near.map(u => u.name), ['烈火大师', '寒冰大师', '风暴大师', '生命大师']);
    assert.equal(arena.sides.far.length, 2);
    assert.equal(arena.sides.far[0].name, '暗影小鬼');

    for (const unitId of MASTERS_ORDER) {
      const hand = wizardAttackHand(arena, unitId);
      assert.equal(hand.length, 4, `${unitId}/${targetLang} 应持有3张本系技能卡+1张文字卡`);
      assert.deepEqual(hand.slice(0, 3).map(h => h.key), MASTER_SHOWCASE_CHOICES[unitId]);
      assert.equal(hand[3].wordCard, true);
      const wSeq = wordCardInHand(arena, unitId);
      assert.equal(hand[3].seq, wSeq);
      assert.equal(arena.unitsById[unitId].wordCards[wSeq].id, wordCard.id);
    }

    // Pick showcase skills for the first 3 wizards and the forged 光 word card for the 4th wizard.
    const picks = {
      'master-fire': wizardAttackHand(arena, 'master-fire')[0],
      hero: wizardAttackHand(arena, 'hero')[1],
      'master-storm': wizardAttackHand(arena, 'master-storm')[2],
      'master-life': wizardAttackHand(arena, 'master-life')[3],
    };
    const groups = finaleResolve(arena, picks);
    const frames = groups.flatMap(g => g.frames);
    const casts = frames.filter(f => f.event.type === 'cast');
    assert.deepEqual(
      casts.map(f => f.event.caster),
      ['imp-1', 'imp-2', ...MASTERS_ORDER],
      `${targetLang} 决战中2只小鬼与4位大师均应完整出手`,
    );
    assert.equal(arena.winner, 'near', `${targetLang} 4v2 决战应获胜`);
    assert.equal(frames.filter(f => f.event.type === 'fizzle').length, 0, `${targetLang} 决战应0失误`);
    assert.equal(Object.keys(arena.unsupported || {}).length, 0);
  }
});
