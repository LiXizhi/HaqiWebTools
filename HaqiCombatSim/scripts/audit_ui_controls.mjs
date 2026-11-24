// Count rendered controls in isolated game views. Run against a local source server.
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';

const {values} = parseArgs({options: {
    url: {type: 'string', default: 'http://127.0.0.1:8791'},
    playwright: {type: 'string', default: process.env.HAQI_PLAYWRIGHT_PACKAGE || 'playwright'},
    executable: {type: 'string'}, out: {type: 'string'},
    mobile: {type: 'boolean', default: false},
}});
const {chromium} = createRequire(import.meta.url)(values.playwright);
const origin = new URL(values.url).origin;
const browser = await chromium.launch({headless: true, executablePath: values.executable});
const viewport = values.mobile ? {width: 390, height: 844} : {width: 1280, height: 800};

// Measure the rendered box and its UI icon. A pet portrait, item drawing or card
// illustration inside the box is content and does not determine the control skin.
function inspectControls(rootSelector) {
    const categories = {imageSurface: 0, imageIcon: 0, contentArt: 0, code: 0};
    const groups = new Map();
    const selector = 'button,input:not([type=hidden]),select,textarea,summary,a[href],[role=button],[role=tab],[role=switch],[role=checkbox],[role=slider]';
    const visible = node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && node.checkVisibility({visibilityProperty: true, opacityProperty: true});
    };
    function hasImage(node) {
        if (!visible(node)) return false;
        return [null, '::before', '::after'].some(pseudo => {
            const style = getComputedStyle(node, pseudo);
            if (pseudo && (style.content === 'none' || style.content === 'normal')) return false;
            if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0) return false;
            return /url\(/.test([style.backgroundImage, style.borderImageSource, style.maskImage].join(' ').replace(/url\(["']?data:image\/svg[^)]*\)/gi, ''));
        });
    }
    for (const node of document.querySelector(rootSelector).querySelectorAll(selector)) {
        if (!visible(node)) continue;
        const icon = node.querySelector('.icon[data-ui-icon]');
        let category = 'code';
        if (hasImage(node)) category = 'imageSurface';
        else if (icon && hasImage(icon)) category = 'imageIcon';
        else if ([...node.querySelectorAll('canvas,img,.pet-sheet')].some(child => child.closest(selector) === node && visible(child))) {
            category = 'contentArt';
        }
        categories[category]++;
        const key = [category, node.localName, node.className, icon?.dataset.uiIcon].join('|');
        const group = groups.get(key) || {category, tag: node.localName, className: node.className, count: 0, examples: []};
        const label = (node.getAttribute('aria-label') || node.title || node.textContent || node.type || '').trim().replace(/\s+/g, ' ').slice(0, 64);
        if (group.examples.length < 3 && !group.examples.includes(label)) group.examples.push(label);
        group.count++;
        groups.set(key, group);
    }
    return {categories, groups: [...groups.values()]};
}

const samples = [];
try {
    const page = await browser.newPage({viewport, hasTouch: values.mobile, isMobile: values.mobile});
    page.setDefaultTimeout(30000);
    const entry = await page.request.get(origin + '/Haqi.html');
    if (!entry.ok()) throw Error('无法读取正式入口 Haqi.html');
    const sheets = await page.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html')
        .querySelectorAll('link[rel=stylesheet]')].map(link => link.getAttribute('href')), await entry.text());
    if (!sheets.includes('css/adventure_storybook.css')) throw Error('正式入口缺少绘本样式');
    // Fixtures import the real views but often load only part of the production CSS.
    await page.route(/\/tests\/fixtures\/[^/]+\.html\?/, async route => {
        const response = await route.fetch();
        const html = (await response.text()).replace(/<link\b[^>]+>/gi, tag =>
            sheets.some(path => tag.includes('"' + path + '"') || tag.includes('../../' + path + '"')) ? '' : tag);
        const links = sheets.map(path => '<link rel="stylesheet" href="/' + path + '">').join('');
        await route.fulfill({response, body: html.replace(/<meta charset="utf-8">/i, tag => tag + links)});
    });

    async function open(fixture, ready, loadSkin = false) {
        const url = new URL('/tests/fixtures/' + fixture, origin);
        url.searchParams.set('assets', 'local');
        await page.goto(url.href, {waitUntil: 'domcontentloaded'});
        await page.locator(ready).first().waitFor({state: 'attached'});
        if (loadSkin) {
            await page.evaluate(async () => {
                document.body.classList.add('haqi-app');
                if (!document.querySelector('base')) {
                    const base = document.createElement('base');
                    base.href = location.origin + '/';
                    document.head.append(base);
                }
                const {loadUiArt} = await import('/js/adventure_ui_art.js');
                await loadUiArt('local');
            });
        }
        await page.locator('html.forest-ui').waitFor({state: 'attached'});
    }
    async function record(name, root) {
        const sample = await page.evaluate(inspectControls, root);
        if (!sample.groups.length) throw Error(name + ' 没有可统计的控件');
        samples.push({name, ...sample});
    }

    await open('tabs.html?panel=shop', 'html[data-fixture-ready="1"]');
    for (const [kind, name] of [['shop','商城 · 冒险补给'], ['inventory','背包'], ['deck','卡包'], ['pet','宠物'],
        ['upgrade','强化'], ['gems','镶嵌'], ['checkin','在线领奖'], ['learning-mode','双语学习']]) {
        await page.evaluate(kind => window.__fixtureShow(kind), kind);
        await record(name, '#root');
        if (kind === 'shop') {
            await page.getByRole('button', {name: '查看全部商品', exact: true}).click();
            await record('商城 · 全部商品', '#root');
        }
    }
    await open('settings.html', 'html[data-fixture-ready="1"]');
    for (const [index, name] of ['旅途', '游戏', '语言', '关于'].entries()) {
        await page.locator('.settings-tab').nth(index).click();
        await record('设置 · ' + name, '#root');
    }
    await open('exp-bar.html', 'html[data-fixture-ready="1"]');
    await record('冒险主界面', '#hud');
    await open('role-title.html', 'html[data-fixture-ready="1"]');
    await record('角色选择', '#entry');
    await open('forest-ui.html', '#root .dialogue-box button');
    await record('NPC 对白', '#root');
    await open('quest-journal.html?noatlas', 'html[data-fixture-ready="1"]', true);
    await record('任务手记', '#root');
    await open('dictionary.html?entry=hello', '#overlay .dictionary-shell input, #overlay .dictionary-chunk-listen', true);
    await record('字典 · 英文词条', '#overlay');
    await open('world-atlas.html', '#overlay .haqi-atlas-landmark:not([hidden])');
    await record('群岛地图', '#overlay');
    await open('battle-targeting.html', '#battle-canvas');
    await record('战斗选牌', '#root');
    await open('home-learning-world.html', '#overlay .home-world .home-canvas', true);
    await record('家园场景', '#overlay');

    const totals = {imageSurface: 0, imageIcon: 0, contentArt: 0, code: 0};
    for (const {categories} of samples) for (const key of Object.keys(totals)) totals[key] += categories[key];
    console.table(samples.map(({name, categories}) => ({name, ...categories})));
    console.table([totals]);
    if (values.out) {
        await mkdir(dirname(values.out), {recursive: true});
        await writeFile(values.out, JSON.stringify({viewport, samples, totals}, null, 2) + '\n');
    }
} finally {
    await browser.close();
}
