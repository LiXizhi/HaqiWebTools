// Walk the English adventure UI and list visible Chinese. Run with Playwright installed.
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PLAYWRIGHT_ROOT}/playwright/package.json`);
const { chromium } = require('playwright');

const base = process.env.HAQI_URL || 'http://127.0.0.1:8765/Haqi.html';
const cjk = /[\u4e00-\u9fff]/;

async function visibleChinese(page) {
    return page.evaluate(() => {
        const pattern = /[\u4e00-\u9fff]/;
        const seen = new Set();
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent.replace(/\s+/g, ' ').trim();
            if (!text || !pattern.test(text) || seen.has(text)) continue;
            const el = node.parentElement;
            if (!el) continue;
            if (el.closest('[hidden], [aria-hidden="true"]')) continue;
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) continue;
            seen.add(text);
            out.push(text.slice(0, 120));
        }
        return out;
    });
}

async function clickButton(page, name) {
    const button = page.getByRole('button', { name, exact: false }).first();
    await button.waitFor({ state: 'visible', timeout: 30000 });
    await button.click();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.getByRole('button', { name: /下一步|Next/ }).first().waitFor({ timeout: 120000 });
await clickButton(page, /下一步|Next · Choose your Cuddle Dragon|选择抱抱龙/);
await clickButton(page, /下一步|Next · Choose your school|选择系别/);
await clickButton(page, /开始冒险|Begin the adventure|确认选择/);
await page.locator('.utility-nav').waitFor({ timeout: 60000 });
await clickButton(page, /设置|Settings/);
await clickButton(page, 'English');
const screens = {};
await page.getByRole('button', { name: 'World map' }).waitFor({ timeout: 30000 });
screens.settings = await visibleChinese(page);
await page.keyboard.press('Escape');
await page.locator('#overlay').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
screens.hud = await visibleChinese(page);
await page.locator('.utility-nav').getByRole('button', { name: 'World map' }).click({ force: true });
await page.locator('.island-guide, .world-chart').first().waitFor({ timeout: 20000 });
screens.map = await visibleChinese(page);
const world = page.getByRole('button', { name: 'Open the world map' });
if (await world.count()) {
    await world.first().click();
    await page.locator('.world-chart').waitFor({ timeout: 20000 });
    screens.world = await visibleChinese(page);
    await page.keyboard.press('Escape');
}
await clickButton(page, /签到|Check in|Gourd|米酒/);
screens.checkin = await visibleChinese(page);
console.log(JSON.stringify({ errors, screens }, null, 2));
const leftover = Object.values(screens).flat().filter(text => cjk.test(text) && !['小哈奇', '中文', '日本語', '한국어'].includes(text));
await browser.close();
if (leftover.length || errors.length) process.exitCode = 1;
