import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const jsRoot = path.resolve(new URL('../js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function walkJs(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkJs(full));
        else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
}

function parseRelativeImports(text) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const re = /(?:^|\s|;)(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;
    const out = [];
    let match;
    while ((match = re.exec(stripped)) !== null) {
        const spec = match[1] || match[2];
        if (spec && spec.startsWith('.')) out.push(spec);
    }
    return out;
}

const files = walkJs(jsRoot);
const graph = new Map();

for (const file of files) {
    const rel = path.relative(jsRoot, file).replace(/\\/g, '/');
    const text = fs.readFileSync(file, 'utf8');
    const targets = [];
    for (const spec of parseRelativeImports(text)) {
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
        if (resolved.endsWith('.js')) targets.push(resolved);
    }
    graph.set(rel, [...new Set(targets)]);
}

test('all relative JS imports resolve to existing files', () => {
    const missing = [];
    for (const [from, targets] of graph.entries()) {
        for (const to of targets) {
            if (!fs.existsSync(path.join(jsRoot, to))) missing.push(`${from} -> ${to}`);
        }
    }
    assert.deepEqual(missing, []);
});

test('pure *_core.js modules depend only on *_core.js and touch no browser globals', () => {
    const badImports = [];
    const badGlobals = [];
    for (const [rel, targets] of graph.entries()) {
        if (!rel.endsWith('_core.js')) continue;
        for (const to of targets) {
            if (!to.endsWith('_core.js')) badImports.push(`${rel} -> ${to}`);
        }
        const stripped = fs
            .readFileSync(path.join(jsRoot, rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        const usesGlobalWindow = !/\b(?:const|let|var)\s+window\b/.test(stripped) && /\bwindow\s*\./.test(stripped);
        if (/\b(document|fetch|localStorage|indexedDB)\b/.test(stripped) || usesGlobalWindow) {
            badGlobals.push(rel);
        }
    }
    assert.deepEqual(badImports, []);
    assert.deepEqual(badGlobals, []);
});

test('JS module graph has zero circular dependencies', () => {
    const visited = new Set();
    const stack = new Set();
    const cycles = [];
    function dfs(node, trail) {
        if (stack.has(node)) {
            cycles.push(trail.slice(trail.indexOf(node)).concat(node).join(' -> '));
            return;
        }
        if (visited.has(node)) return;
        visited.add(node);
        stack.add(node);
        for (const next of graph.get(node) || []) dfs(next, trail.concat(node));
        stack.delete(node);
    }
    for (const node of graph.keys()) dfs(node, []);
    assert.deepEqual(cycles, []);
});

test('views/ and ui/ do not depend on adventure controllers, and legacy compatibility shims remain removed', () => {
    const violations = [];
    for (const [rel, targets] of graph.entries()) {
        if (rel.startsWith('views/') || rel.startsWith('ui/')) {
            for (const to of targets) {
                if (to.startsWith('adventure/') && !to.startsWith('adventure/renderer/') && !to.startsWith('adventure/presenters/')) {
                    violations.push(`${rel} -> ${to}`);
                }
            }
        }
    }
    assert.deepEqual(violations, []);
    for (const shim of ['view_adventure.js', 'view_adventure_controls.js', 'view_detail_dialog.js', 'adventure_renderer.js', 'view_home_art.js']) {
        assert.equal(fs.existsSync(path.join(jsRoot, shim)), false, `${shim} should stay removed`);
    }
});

test('no view_*.js remains in js/ root and adventure controllers do not construct DOM nodes directly', () => {
    const rootViews = fs.readdirSync(jsRoot, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.startsWith('view_') && entry.name.endsWith('.js'))
        .map(entry => entry.name);
    assert.deepEqual(rootViews, []);
    const controllerDomViolations = [];
    for (const rel of graph.keys()) {
        if (!rel.startsWith('adventure/') || !rel.endsWith('_controller.js')) continue;
        const stripped = fs
            .readFileSync(path.join(jsRoot, rel), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        if (/\b(createElement|innerHTML)\b/.test(stripped)) controllerDomViolations.push(rel);
    }
    assert.deepEqual(controllerDomViolations, []);
});
