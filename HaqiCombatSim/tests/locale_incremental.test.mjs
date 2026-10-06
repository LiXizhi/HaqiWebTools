import test from 'node:test';
import assert from 'node:assert/strict';
import {appendTranslations,validateTranslationRows} from '../scripts/update_locale_batches.mjs';
import {parseLocaleFile} from '../js/locale_core.js';

test('incremental merge preserves existing translations and escapes literal pipes/newlines',()=>{
    const before='# source\n你好||Existing hello\n';
    const rows=[{key:'你好',ja:'replacement'},{key:'任务|{count}\n下一步',ja:'クエスト|{count}\n次へ'}];
    const result=appendTranslations(before,rows,'ja');
    assert.equal(result.added,1);
    assert.ok(result.text.startsWith(before));
    assert.deepEqual(parseLocaleFile(result.text),{'你好':'Existing hello','任务|{count}\n下一步':'クエスト|{count}\n次へ'});
    assert.equal(appendTranslations(result.text,rows,'ja').text,result.text);
});
test('batch validation rejects missing/reordered keys, empty text and changed placeholders before merge',()=>{
    const input=[{key:'{name}有{count}个。{name}'}];
    assert.throws(()=>validateTranslationRows(input,[],['en']));
    assert.throws(()=>validateTranslationRows(input,[{key:'wrong',en:'wrong'}],['en']));
    assert.throws(()=>validateTranslationRows(input,[{key:input[0].key,en:' '}],['en']));
    assert.throws(()=>validateTranslationRows(input,[{key:input[0].key,en:'{name} has {count}.'}],['en']),/Placeholder/);
    assert.throws(()=>validateTranslationRows(input,[{key:input[0].key,en:'{name}有{count}。{name}'}],['en']),/Chinese remains/);
    assert.equal(validateTranslationRows(input,[{key:input[0].key,en:'{name} has {count}. {name}'}],['en']).length,1);
});
test('incremental merge never silently replaces an existing blank entry',()=>{
    assert.throws(()=>appendTranslations('提示||\n',[{key:'提示',en:'Hint'}],'en'),/explicit review/);
});
