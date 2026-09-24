import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localePackageFiles } from '../scripts/package_locale.mjs';
import { loadLocaleFiles, hasLocale, textFor } from '../js/locale.js';

test('each language file is packaged alone and comments are removed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'haqi-locale-'));
    try {
        fs.writeFileSync(path.join(directory, 'en.txt'), '# js/view_adventure.js\n设置||Settings\n\n# js/card_renderer.js\n辅助魔法||Support spell\n');
        fs.writeFileSync(path.join(directory, 'ja.txt'), '# js/view_adventure.js\n设置||設定\n');
        fs.writeFileSync(path.join(directory, 'notes.md'), '# no');
        const files = localePackageFiles(directory);
        assert.deepEqual(files.map(file => file.fileName), ['data/adventure/locale/en.txt', 'data/adventure/locale/ja.txt']);
        assert.equal(files[0].source.includes('#'), false);
        assert.match(files[0].source, /设置\|\|Settings/);
        assert.match(files[0].source, /辅助魔法\|\|Support spell/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('app load fetches only the requested language files', async () => {
    const calls = [];
    const fetchText = async file => {
        calls.push(file);
        if (file.endsWith('/ja.txt')) throw new Error('missing');
        return '# js/view_adventure.js\n设置||Settings\n';
    };
    await loadLocaleFiles(['zh-CN', 'en'], fetchText);
    assert.deepEqual(calls, ['./data/adventure/locale/en.txt']);
    assert.equal(textFor('设置', 'en'), 'Settings');
    assert.equal(hasLocale('ja'), false);
    await loadLocaleFiles(['en'], fetchText);
    assert.equal(calls.length, 1);
    await loadLocaleFiles(['ja'], fetchText);
    await loadLocaleFiles(['ja'], fetchText);
    assert.deepEqual(calls.filter(file => file.endsWith('/ja.txt')), ['./data/adventure/locale/ja.txt']);
    assert.equal(textFor('设置', 'ja'), '设置');
});
