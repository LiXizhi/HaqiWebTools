// Standalone browser acceptance: node scripts/check_hanzi_huo.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const playwrightPath = option('--playwright', process.env.HAQI_PLAYWRIGHT || 'playwright');
const { chromium } = createRequire(import.meta.url)(playwrightPath);
const output = path.resolve('.cache/hanzi-huo');
fs.mkdirSync(output, { recursive: true });
const html = fs.readFileSync(new URL('../hanzi/hanzi_huo.html', import.meta.url));
const external = [];
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/hanzi/hanzi_huo.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/hanzi/`;
const channel = option('--channel', process.env.HAQI_BROWSER_CHANNEL || '');
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
const report = [];

try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      hasTouch: mobile,
      isMobile: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url());
    });

    await page.clock.install();
    await page.goto(base + 'hanzi_huo.html');
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => {
      await page.clock.runFor(120);
      await page.waitForTimeout(20);
      await page.screenshot({ path: path.join(output, `${tag}-${name}.png`) });
    };
    const until = async (expr, limit = 60000, label = expr) => {
      for (let t = 0; t < limit; t += 200) {
        if (await page.evaluate(expr)) return;
        await page.clock.runFor(200);
      }
      throw new Error(`timeout (${tag}): ${label}`);
    };

    // 1. Intro
    await page.clock.runFor(2400);
    await shot('01-intro');
    await page.getByRole('button', { name: '开始', exact: true }).click();

    // 2. Camp -> Spark
    await page.clock.runFor(1200);
    await shot('02-camp');
    await until(`window.__huo.state.sceneIdx === 1`, 12000, 'scene 1 spark');
    await shot('03-unlit');

    // Hold to ignite fire
    const hp = await page.evaluate(() => window.__huo.toScreen(800, 560));
    await page.mouse.move(hp.x, hp.y);
    await page.mouse.down();
    for (let i = 0; i < 10; i++) await page.clock.runFor(220);
    await page.mouse.up();
    await until(`window.__huo.state.sparkIgnited === true`, 10000, 'sparkIgnited');
    await shot('04-ignited');

    // 3. Drag upward to fan flame
    await until(`window.__huo.state.sceneIdx === 2`, 10000, 'scene 2 flame');
    const fStart = await page.evaluate(() => window.__huo.flameScreen(0.22));
    await page.mouse.move(fStart.x, fStart.y);
    await page.mouse.down();
    for (let i = 1; i <= 16; i++) {
      const p = await page.evaluate(u => window.__huo.flameScreen(u), 0.22 + (i / 16) * 0.78);
      await page.mouse.move(p.x, p.y);
      await page.clock.runFor(40);
    }
    await page.mouse.up();
    await until(`window.__huo.state.flameDone === true`, 10000, 'flameDone');
    await shot('05-blaze');

    // 4. Warm 3 spots
    await until(`window.__huo.state.sceneIdx === 3`, 10000, 'scene 3 warmth');
    for (let i = 0; i < 3; i++) {
      const pt = await page.evaluate(idx => {
        const s = window.__huo.WARM_SPOTS[idx];
        return window.__huo.toScreen(s.x, s.y);
      }, i);
      await page.mouse.click(pt.x, pt.y);
      await page.clock.runFor(300);
    }
    assert.equal(await page.evaluate(() => window.__huo.state.warmCount), 3);
    await shot('06-warmed');

    // 5. Blaze showcase & 6. Glyph evolution
    await until(`window.__huo.state.sceneIdx === 4`, 10000, 'scene 4 blaze');
    await page.clock.runFor(1200);
    await shot('07-three-flames');

    await until(`window.__huo.state.sceneIdx === 5`, 10000, 'scene 5 glyph');
    await page.clock.runFor(1000);
    await shot('08-oracle');
    await page.clock.runFor(3500);
    await shot('09-regular-radicals');

    // 7. Trace 4 strokes
    await until(`window.__huo.state.sceneIdx === 6`, 15000, 'scene 6 write');
    await shot('10-write-start');
    for (let s = 0; s < 4; s++) {
      const pts = await page.evaluate(idx => {
        return window.__huo.STROKES[idx].pts.map(p => window.__huo.glyphToScreen(p[0], p[1]));
      }, s);
      await page.mouse.move(pts[0].x, pts[0].y);
      await page.mouse.down();
      for (const q of pts.slice(1)) {
        await page.mouse.move(q.x, q.y, { steps: 4 });
        await page.clock.runFor(30);
      }
      await page.mouse.up();
      await page.clock.runFor(160);
    }
    await until(`window.__huo.state.writtenDone === true`, 10000, 'writtenDone');
    await shot('11-write-done');

    // 8. Words & 9. Finale
    await until(`window.__huo.state.sceneIdx === 7`, 10000, 'scene 7 words');
    await page.clock.runFor(4500);
    await shot('12-words');

    await until(`window.__huo.state.sceneIdx === 8`, 12000, 'scene 8 finale');
    await shot('13-finale');

    assert.equal(errors.length, 0, `${tag} console/page errors: ${errors.join('; ')}`);
    assert.equal(external.length, 0, `external requests: ${external.join(', ')}`);
    report.push({ viewport: tag, strokes: 4, errors: errors.length });
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(JSON.stringify(report), 'screenshots:', output);
