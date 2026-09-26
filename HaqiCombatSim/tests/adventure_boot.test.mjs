import test from 'node:test';
import assert from 'node:assert/strict';
import { readBootLocale } from '../js/adventure_boot.js';
import { localeIdsToLoad } from '../js/locale_core.js';

const storage = entries => ({ getItem: key => entries[key] ?? null });
const catalog = save => JSON.stringify({ catalog: { activeId: 'active', roles: [{ id: 'other', save: { locale: 'zh-CN' } }, { id: 'active', save }] } });

test('startup reads the active account language without falling back to guest progress', () => {
    const entries = { 'haqi.roles.last-account.v1': 'a/b', 'haqi.roles.v1.account.a%2Fb': catalog({ locale: 'en' }), 'haqi.roles.v1.guest': catalog({ locale: 'ko' }) };
    assert.deepEqual(localeIdsToLoad(readBootLocale(storage(entries))), ['en']);
    delete entries['haqi.roles.v1.account.a%2Fb'];
    assert.equal(readBootLocale(storage(entries)).locale, 'zh-CN');
});

test('startup reads guest and legacy language preferences', () => {
    assert.equal(readBootLocale(storage({ 'haqi.roles.v1.guest': catalog({ locale: 'en' }) })).locale, 'en');
    assert.equal(readBootLocale(storage({ 'haqi.adventure.kids.v1': JSON.stringify({ locale: 'ja' }) })).locale, 'ja');
});

test('local display-language preference outranks the role save', () => {
    // 首页/设置窗的选择写入 haqi.locale.v1；刷新后优先于角色存档里的 locale。
    assert.equal(readBootLocale(storage({ 'haqi.locale.v1': 'en', 'haqi.roles.v1.guest': catalog({ locale: 'zh-CN' }) })).locale, 'en');
    assert.equal(readBootLocale(storage({ 'haqi.locale.v1': 'ko' })).locale, 'ko');
});

test('an invalid local language preference is ignored', () => {
    assert.equal(readBootLocale(storage({ 'haqi.locale.v1': 'bogus', 'haqi.roles.v1.guest': catalog({ locale: 'ko' }) })).locale, 'ko');
});

test('startup loads the learning target and native dictionaries', () => {
    const result = readBootLocale(storage({ 'haqi.roles.v1.guest': catalog({ locale: 'zh-CN', languageLearning: { enabled: true, target: 'en', native: 'ko' } }) }));
    assert.deepEqual(localeIdsToLoad(result), ['en', 'ko']);
});

test('missing, damaged or inaccessible storage leaves startup in Chinese', () => {
    for (const input of [storage({}), storage({ 'haqi.roles.v1.guest': '{' }), { getItem() { throw Error('blocked'); } }]) {
        assert.deepEqual(localeIdsToLoad(readBootLocale(input)), []);
    }
});
