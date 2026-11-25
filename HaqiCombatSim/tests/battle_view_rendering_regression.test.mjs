import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installExpansion } from '../js/adventure_expansion_core.js';
import { installCatalogQuests } from '../js/adventure_catalog_quests_core.js';
import { installNpcCatalog } from '../js/adventure_npc_core.js';
import { installFishing } from '../js/adventure_fishing_core.js';
import * as A from '../js/adventure_core.js';
import { renderHanziForge } from '../js/hanzi/view_hanzi_forge.js';
import { renderHanziSteleScroll } from '../js/hanzi/view_hanzi_stele_scroll.js';
import { renderArchipelagoChronicle } from '../js/views/adventure/view_archipelago_chronicle.js';
import { renderCampfireCooking } from '../js/views/adventure/view_campfire_cooking.js';
import { buildHudTrackerViewModel } from '../js/adventure/presenters/hud_view_model.js';

const read = file => JSON.parse(fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8'));

function setupContent() {
    const cards = read('data/kids/cards.json');
    const charms = read('data/kids/charms.json');
    const names = read('data/kids/card_names.json');
    const { content } = installExpansion(
        read('data/adventure/chapter.json'),
        read('data/adventure/combat.json'),
        read('data/adventure/pets.json'),
        read('data/adventure/shop-candidates.json'),
        cards,
        charms,
        names,
    );
    installCatalogQuests(content, read('data/adventure/quest-runtime.json'));
    installNpcCatalog(content, read('data/adventure/npc-catalog.json'));
    installFishing(content, read('data/adventure/fishing.json'));
    return content;
}

const content = setupContent();

function createFakeDom() {
    class FakeNode {
        constructor(tag, text = '') {
            this.tagName = tag ? tag.toUpperCase() : '#TEXT';
            this.nodeType = tag ? 1 : 3;
            this.className = '';
            this.children = [];
            this.childNodes = this.children;
            this.attrs = {};
            this.dataset = {};
            this.style = {};
            this._text = text;
            this.classList = {
                add: (...names) => {
                    const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
                    for (const n of names) set.add(n);
                    this.className = [...set].join(' ');
                },
                contains: name => (this.className || '').split(/\s+/).includes(name),
                toggle: (name, force) => {
                    const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
                    const on = force === undefined ? !set.has(name) : !!force;
                    if (on) set.add(name);
                    else set.delete(name);
                    this.className = [...set].join(' ');
                },
            };
        }
        get textContent() {
            if (this.nodeType === 3) return this._text;
            if (!this.children.length) return this._text;
            return this.children.map(c => (typeof c === 'string' ? c : c.textContent)).join('');
        }
        set textContent(value) {
            this.children = [];
            this.childNodes = this.children;
            this._text = value === null || value === undefined ? '' : String(value);
        }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        getAttribute(k) { return this.attrs[k] ?? null; }
        append(...items) {
            for (const item of items) {
                if (item === null || item === undefined) continue;
                this.children.push(typeof item === 'string' ? new FakeNode(null, item) : item);
            }
        }
        replaceChildren(...items) {
            this.children = [];
            this.childNodes = this.children;
            this._text = '';
            this.append(...items);
        }
        querySelector(sel) {
            return this.querySelectorAll(sel)[0] || null;
        }
        querySelectorAll(sel) {
            const out = [];
            const match = node => {
                if (node.nodeType !== 1) return false;
                if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
                return node.tagName.toLowerCase() === sel.toLowerCase();
            };
            const walk = node => {
                for (const c of node.children) {
                    if (match(c)) out.push(c);
                    walk(c);
                }
            };
            walk(this);
            return out;
        }
    }
    const head = new FakeNode('head');
    const doc = {
        head,
        createElement: tag => new FakeNode(tag),
        createTextNode: text => new FakeNode(null, text),
        createElementNS: (_ns, tag) => new FakeNode(tag),
        getElementById: () => null,
        documentElement: { lang: 'zh-CN' },
    };
    return { doc, FakeNode, root: new FakeNode('div') };
}

function withFakeDom(fn) {
    const prevDoc = globalThis.document;
    const prevNode = globalThis.Node;
    const { doc, FakeNode, root } = createFakeDom();
    globalThis.document = doc;
    globalThis.Node = FakeNode;
    try {
        return fn({ doc, root });
    } finally {
        globalThis.document = prevDoc;
        globalThis.Node = prevNode;
    }
}

function assertCleanModal(root, name) {
    const header = root.querySelector('.modal-header');
    assert.ok(header, `${name} should render .modal-header`);
    const h2 = header.querySelector('h2');
    assert.ok(h2 && h2.textContent.trim().length > 0, `${name} should render a real <h2> title`);
    const closeBtn = header.querySelector('.close-button');
    assert.ok(closeBtn, `${name} should render a real .close-button inside .modal-header`);
    const allText = root.textContent;
    assert.equal(allText.includes('[object '), false, `${name} must not contain serialized [object ...] text, got: ${allText.slice(0, 240)}`);
}

test('New modal views render real headings, close buttons, and zero [object ...] serialization bugs across all tabs', () => {
    const save = A.createAdventure(content, { name: '渲染测试', school: 'fire', seed: 77 });
    save.zone = 'tide';
    save.islandPuzzles = { solved: { 'forge-ming': true } };
    save.hanziSeal = 'ming';
    save.campfireBuff = { id: 'herbal-tea', remainingBattles: 3 };
    const assets = { content };

    withFakeDom(({ root }) => {
        // 1. Hanzi Forge: bench tab + codex tab
        renderHanziForge(root, { save, assets }, { close: () => {}, getSave: () => save });
        assertCleanModal(root, 'view_hanzi_forge (bench)');
        const forgeTabs = root.querySelectorAll('.hanzi-forge-tabs')[0]?.querySelectorAll('button') || [];
        assert.ok(forgeTabs.length >= 2);
        forgeTabs[1].onclick();
        assertCleanModal(root, 'view_hanzi_forge (codex)');
        assert.ok(root.textContent.includes('明·光华战印'), 'Hanzi Forge codex should render equipped seal name');

        // 2. Hanzi Stele Scroll
        renderHanziSteleScroll(root, { save, assets }, { close: () => {} });
        assertCleanModal(root, 'view_hanzi_stele_scroll');

        // 3. Archipelago Chronicle: all 4 tabs
        for (const tab of ['daily', 'trilogy', 'earth', 'honors']) {
            renderArchipelagoChronicle(root, { save, assets, initialTab: tab, initialIslandId: 'tide' }, { close: () => {}, getSave: () => save });
            assertCleanModal(root, `view_archipelago_chronicle (${tab})`);
        }

        // 4. Campfire Cooking: cook tab + fishing album tab
        for (const tab of ['cook', 'album']) {
            renderCampfireCooking(root, { save, assets, initialTab: tab }, { close: () => {}, getSave: () => save });
            assertCleanModal(root, `view_campfire_cooking (${tab})`);
        }
        assert.ok(root.textContent.includes('胖乎乎水母'), 'Fishing album tab should render fish species names');
    });
});

test('HUD surfaces Campfire Cooking and Archipelago Chronicle on non-camp islands even if camp openingJourney is unfinished', () => {
    const save = A.createAdventure(content, { name: '跨岛旅人', school: 'fire', seed: 88 });
    save.openingJourney = { version: 1, phase: 'offer' };
    save.zone = 'camp';
    const campVm = buildHudTrackerViewModel({ save, assets: { content } });
    assert.equal(campVm.campfireSummary, null);
    assert.equal(campVm.chronicleSummary, null);

    save.zone = 'tide';
    const tideVm = buildHudTrackerViewModel({ save, assets: { content } });
    assert.ok(tideVm.campfireSummary, 'campfireSummary should appear on Tide Island');
    assert.ok(tideVm.chronicleSummary, 'chronicleSummary should appear on Tide Island');
    assert.equal(tideVm.chronicleSummary.isTrilogy, true);
});
