import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../Haqi.html', import.meta.url), 'utf8');
const guard = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
function entry(protocol) {
    const listeners = {};
    const card = { busy: 'true', setAttribute(key, value) { this[key] = value; } };
    const nodes = { 'boot-loading': card, 'load-caption': {}, 'load-status': {}, 'load-progress': { hidden: false }, 'adventure-module': { addEventListener(type, fn) { listeners[type] = fn; } } };
    vm.runInNewContext(guard, { location: { protocol }, document: { getElementById: id => nodes[id] } });
    return { nodes, listeners };
}

test('the first frame is visible before module loading', () => {
    const section = html.match(/<section id="boot-loading"[^>]*>/)[0];
    assert.doesNotMatch(section, /\bhidden\b/);
    assert.match(html, /id="load-title">魔法哈奇</);
    assert.match(html, /id="load-status"[^>]*>准备出发…</);
});

test('opening a local file explains how to enter instead of spinning forever', () => {
    const { nodes } = entry('file:');
    assert.equal(nodes['load-status'].textContent, '请通过游戏预览入口打开。');
    assert.equal(nodes['boot-loading']['aria-busy'], 'false');
    assert.equal(nodes['load-progress'].hidden, true);
});

test('HTTP startup keeps loading and reports module failure without changing saved data', () => {
    const { nodes, listeners } = entry('http:');
    assert.equal(nodes['load-progress'].hidden, false);
    assert.equal(nodes['load-status'].textContent, undefined);
    listeners.error();
    assert.equal(nodes['load-status'].textContent, '加载失败，请刷新重试。');
    assert.equal(nodes['load-progress'].hidden, true);
    delete nodes['boot-loading'];
    assert.doesNotThrow(() => listeners.error());
});
