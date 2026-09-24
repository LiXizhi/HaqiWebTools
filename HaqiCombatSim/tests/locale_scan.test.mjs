import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsStrings, extractJsonStrings, compareToLocale } from '../scripts/scan_locale.mjs';

test('js scan keeps string literals and skips comments', () => {
    const found = extractJsStrings(`
        // 注释不算
        const a = '下次再聊';
        const b = "公式|甲";
        const c = \`接取任务 · \${quest.title}\`;
        /* 块注释 '忽略' */
        const d = '下次再聊';
    `);
    assert.deepEqual(found.filter(row => !row.dynamic).map(row => row.text), ['下次再聊', '公式|甲', '下次再聊']);
    assert.equal(found.find(row => row.dynamic).text, '接取任务 · ${quest.title}');
});

test('json scan can limit fields', () => {
    const all = extractJsonStrings({ label: '交谈', name: '店主', note: '内部说明' });
    assert.deepEqual(all, ['交谈', '店主', '内部说明']);
    assert.deepEqual(extractJsonStrings({ label: '交谈', name: '店主' }, ['label']), ['交谈']);
});

test('missing and stale keys stay apart from dynamic templates', () => {
    const staticHits = new Map([['设置', { file: 'js/view_adventure.js', line: 3 }]]);
    const report = compareToLocale(staticHits, [{ text: '接取任务 · ${quest.title}', file: 'a.js', line: 1 }], '设置||Settings\n旧按钮||Old\n接取任务||Accept quest\n');
    assert.deepEqual(report.missing, []);
    assert.equal(report.stale.find(row => row.key === '旧按钮').inDynamic, false);
    assert.equal(report.stale.find(row => row.key === '接取任务').inDynamic, true);
});
