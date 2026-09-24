import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, lookup, parseLocaleFile, diffLocaleLines, pairAllowed, speechCode, normalizeLocaleSave, formatLocaleLine, stripLocaleComments, localeIdsToLoad } from '../js/locale_core.js';

test('missing key and Chinese stay the Chinese source', () => {
    const dictionaries = { en: parseLocaleFile('下次再聊||Talk to you later\n') };
    assert.equal(lookup('下次再聊', 'en', dictionaries), 'Talk to you later');
    assert.equal(lookup('没有这一行', 'en', dictionaries), '没有这一行');
    assert.equal(lookup('下次再聊', 'zh-CN', dictionaries), '下次再聊');
    assert.equal(lookup('下次再聊', 'ja', dictionaries), '下次再聊');
});

test('locale lines split on the longest pipe run', () => {
    const table = parseLocaleFile([
        '',
        '下次再聊||Talk to you later',
        '公式||a|b',
        '左右都有竖线|||left|side',
        '平局|a|b',
        '下次再聊||ignored',
    ].join('\n'));
    assert.equal(table['下次再聊'], 'Talk to you later');
    assert.equal(table['公式'], 'a|b');
    assert.equal(table['左右都有竖线'], 'left|side');
    assert.equal(table['平局|a|b'], undefined);
    assert.equal(parseLocaleFile('未译||\n')['未译'], '');
    assert.equal(parseLocaleFile(formatLocaleLine('甲|乙', '') + '\n')['甲|乙'], '');
    assert.equal(parseLocaleFile(formatLocaleLine('甲\n乙', '') + '\n')['甲\n乙'], '');
    assert.equal(lookup('未译', 'en', { en: { '未译': '' } }), '未译');
    const noted = parseLocaleFile('# js/view_adventure.js\n下次再聊||Talk to you later\n#甲||Keep\n');
    assert.equal(noted['下次再聊'], 'Talk to you later');
    assert.equal(noted['#甲'], 'Keep');
    assert.equal(stripLocaleComments('# js/view_adventure.js\n下次再聊||Talk to you later\n'), '下次再聊||Talk to you later\n');
    assert.deepEqual(localeIdsToLoad({ locale: 'zh-CN', languageLearning: { enabled: false, native: 'zh-CN', target: 'en' } }), []);
    assert.deepEqual(localeIdsToLoad({ locale: 'en', languageLearning: { enabled: false, native: 'zh-CN', target: 'ja' } }), ['en']);
    assert.deepEqual(localeIdsToLoad({ locale: 'zh-CN', languageLearning: { enabled: true, native: 'ja', target: 'en' } }), ['en', 'ja']);
});

test('diff lists keys missing from the other file and keys absent from the base', () => {
    const base = '甲||A\n乙||B\n';
    const other = '甲||あ\n丙||C\n';
    const diff = diffLocaleLines(base, other);
    assert.deepEqual(diff.missing, ['乙']);
    assert.deepEqual(diff.extra, ['丙']);
});

test('catalog speech codes and language pairs', () => {
    assert.deepEqual(LOCALES.map(row => row.id), ['zh-CN', 'en', 'ja', 'ko']);
    assert.equal(speechCode('zh-CN'), 'zh-CN');
    assert.equal(speechCode('en'), 'en-US');
    assert.equal(speechCode('ja'), 'ja-JP');
    assert.equal(speechCode('ko'), 'ko-KR');
    assert.equal(pairAllowed('zh-CN', 'en'), true);
    assert.equal(pairAllowed('ja', 'ja'), false);
    assert.equal(pairAllowed('en', 'xx'), false);
});

test('save locale defaults without a Chinese dictionary', () => {
    const save = normalizeLocaleSave({});
    assert.equal(save.locale, 'zh-CN');
    assert.deepEqual(save.languageLearning, { enabled: false, native: 'zh-CN', target: 'en' });
    const same = normalizeLocaleSave({ locale: 'ja', languageLearning: { enabled: true, native: 'ko', target: 'ko' } });
    assert.equal(same.locale, 'ja');
    assert.equal(same.languageLearning.target, 'en');
    assert.equal(same.languageLearning.native, 'ko');
});
