// Standalone browser acceptance: node scripts/check_hanzi_ming.mjs --playwright <package path> [--channel chrome|msedge]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const {chromium} = createRequire(import.meta.url)(option('--playwright', 'playwright'));
const output = path.resolve('.cache/hanzi-ming'); fs.mkdirSync(output, {recursive: true});
const html = fs.readFileSync(new URL('../hanzi/hanzi_ming.html', import.meta.url));
const external = [];
const server = http.createServer((req, res) => {
  if (req.url === '/hanzi/hanzi_ming.html') { res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(html); }
  else { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const channel = option('--channel', '');
const browser = await chromium.launch({...(channel ? {channel} : {}), headless: true});
const report = [];
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({
      viewport: mobile ? {width: 390, height: 844} : {width: 1440, height: 900},
      hasTouch: mobile, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1,
      reducedMotion: mobile ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('request', r => {
      if (!r.url().startsWith(`http://127.0.0.1:${server.address().port}/hanzi/`) && !r.url().startsWith('data:')) external.push(r.url());
    });
    await page.clock.install();
    await page.goto(`http://127.0.0.1:${server.address().port}/hanzi/hanzi_ming.html`);
    const tag = mobile ? 'mobile' : 'desktop';
    const shot = async name => { await page.clock.runFor(200); await page.screenshot({path: path.join(output, `${tag}-${name}.png`)}); };
    const g = expr => page.evaluate(expr);
    const until = async (expr, limit = 240000, label = expr) => {
      for (let t = 0; t < limit; t += 250) { if (await page.evaluate(expr)) return; await page.clock.runFor(250); }
      throw new Error(`timeout: ${label}`);
    };
    const scr = (fn, ...a) => page.evaluate(([fn, a]) => window.__ming[fn](...a), [fn, a]);
    // 触摸/鼠标通用的一次拖动
    const drag = async (points) => {
      if (mobile) {
        const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [points[0]]});
        for (const q of points.slice(1)) { await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [q]}); await page.clock.runFor(16); }
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      } else {
        await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
        for (const q of points.slice(1)) { await page.mouse.move(q.x, q.y); await page.clock.runFor(16); }
        await page.mouse.up();
      }
    };
    const tap = async (x, y) => {
      if (mobile) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page.clock.runFor(120);
    };

    await page.clock.runFor(7000); await shot('01-intro');
    await page.getByRole('button', {name: '开始', exact: true}).click();
    await until(`window.__ming.scene==='sDim'`);
    await page.clock.runFor(4200); await shot('02-dim');
    await until(`document.body.classList.contains('grab')`);
    assert.equal(await g(`window.__ming.state.sun.up<0.2`), true, '太阳初始在低处');

    // 拖得太少，太阳回落，不算完成
    let p = await scr('sunScreen');
    await drag([p, {x: p.x, y: p.y - 40}]);
    await page.clock.runFor(900);
    assert.equal(await g(`window.__ming.interactions.length`), 0, '拖到一半不算完成');
    assert.equal(await g(`window.__ming.state.sun.up<0.3`), true, '松手后太阳回落');

    // 把太阳拖到天上
    p = await scr('sunScreen');
    const upY = await page.evaluate(() => window.__ming.toScreen(0, 250).y);
    const sunPath = [];
    for (let i = 0; i <= 20; i++) sunPath.push({x: p.x, y: p.y + (upY - p.y) * (i / 20)});
    await drag(sunPath);
    await until(`window.__ming.interactions.length===1`);
    assert.deepEqual(await g(`window.__ming.interactions.slice()`), ['sun:user']);
    await until(`window.__ming.state.sun.up>0.98`);
    await page.clock.runFor(3000); await shot('03-sunrise');

    await until(`window.__ming.scene==='sMoon'`);
    await until(`document.body.classList.contains('grab')`);
    await page.clock.runFor(500); await shot('04-moon-low');
    p = await scr('moonScreen');
    const mUpY = await page.evaluate(() => window.__ming.toScreen(0, 250).y);
    const moonPath = [];
    for (let i = 0; i <= 20; i++) moonPath.push({x: p.x, y: p.y + (mUpY - p.y) * (i / 20)});
    await drag(moonPath);
    await until(`window.__ming.interactions.length===2`);
    assert.deepEqual(await g(`window.__ming.interactions.slice()`), ['sun:user', 'moon:user']);
    await until(`window.__ming.state.moon.up>0.98`);
    await page.clock.runFor(3000); await shot('05-moonrise');

    await until(`window.__ming.scene==='sMeet'`);
    await until(`document.body.classList.contains('tap')`);
    await page.clock.runFor(1500); await shot('06-two-lights');
    for (let i = 0; i < 3; i++) { await tap(mobile ? 195 : 720, mobile ? 320 : 300); await page.clock.runFor(900); }
    await until(`window.__ming.interactions.length===3`, 120000, 'meet');
    assert.deepEqual(await g(`window.__ming.interactions.slice()`), ['sun:user', 'moon:user', 'meet:user']);
    await until(`window.__ming.state.meet>0.99`);
    await page.clock.runFor(2600); await shot('07-together');

    await until(`window.__ming.scene==='sGlyph'`); await page.clock.runFor(6000); await shot('08-discs');
    await until(`window.__ming.state.glyph.morphFrom&&window.__ming.state.glyph.morph>0.02`, 200000, 'morph started');
    await page.clock.runFor(1400); await shot('09-merging');
    await until(`window.__ming.state.glyph.morph>0.99`, 120000, 'morph');
    await page.clock.runFor(1200); await shot('10-ming');
    await until(`window.__ming.state.glyph.labels>0.99`, 200000, 'labels');
    await shot('11-labelled');

    await until(`document.body.classList.contains('trace')`, 240000, 'write scene');
    await page.clock.runFor(1200); await shot('12-trace-start');
    // 起笔偏离光点、写到一半停手，都不算完成
    let pts = await page.evaluate(() => window.__ming.strokes[0].map(([x, y]) => window.__ming.localToScreen(x, y)));
    const last = pts[pts.length - 1];
    await drag([last, pts[0]]);
    await page.clock.runFor(300);
    await drag(pts.slice(0, Math.floor(pts.length / 2)));
    await page.clock.runFor(400);
    assert.equal(await g(`window.__ming.state.trace.stroke`), 0, '未完成的笔画不计数');
    // 逆序也无效
    await drag(pts.slice().reverse());
    await page.clock.runFor(400);
    assert.equal(await g(`window.__ming.state.trace.stroke`), 0, '逆序不计数');
    for (let i = 0; i < 8; i++) {
      pts = await page.evaluate(i => window.__ming.strokes[i].map(([x, y]) => window.__ming.localToScreen(x, y)), i);
      await drag(pts);
      await page.clock.runFor(160);
      if (i === 3) await shot('13-tracing');
      assert.equal(await g(`window.__ming.state.trace.stroke`), i + 1, `第 ${i + 1} 笔`);
    }
    assert.ok((await g(`window.__ming.interactions.slice()`)).includes('user'), '亲手写字被记录');
    await page.clock.runFor(2500); await shot('14-written');
    await until(`window.__ming.state.wordOn===1`, 240000, 'words');
    await page.clock.runFor(1200); await shot('15-words');
    await until(`window.__ming.finished`, 240000, 'finale');
    await tap(mobile ? 195 : 700, mobile ? 300 : 280);
    await page.clock.runFor(3000); await shot('16-finale');

    assert.equal(await g(`document.documentElement.scrollWidth>innerWidth`), false, 'no horizontal overflow');
    const interactions = await g(`window.__ming.interactions.slice()`);
    // 重播从头开始
    await page.getByRole('button', {name: '重播', exact: true}).click();
    await page.clock.runFor(1500);
    assert.equal(await g(`window.__ming.scene`), 'sDim');
    assert.equal(await g(`window.__ming.state.sun.up`), 0);
    assert.deepEqual(errors, []);
    report.push({viewport: tag, input: mobile ? 'touch' : 'mouse', reducedMotion: mobile, interactions, errors: errors.length});
    await context.close();
  }
  assert.deepEqual(external, [], 'no third-party requests');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report), `screenshots: ${output}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
