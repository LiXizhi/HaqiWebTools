// Optional isolated UI check; never included in the Node-only battle gate.
// HAQI_PLAYWRIGHT points to a directory whose node_modules contains playwright.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('time scroll desktop and touch: walk, discover, type, revisit and return with real CDN art',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:150000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/tests/fixtures/time-scroll.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    try{for(const width of [1280,390]){
        const page=await browser.newPage({viewport:{width,height:844},hasTouch:width===390,reducedMotion:width===390?'reduce':'no-preference'}),errors=[];
        const sceneryResponses=[];page.on('response',r=>{if(r.url().includes('/city-living/')&&r.ok())sceneryResponses.push(r.url());});
        page.on('pageerror',e=>errors.push(e.message));
        await page.goto(url);await page.getByRole('dialog',{name:'城市时光长卷',exact:true}).waitFor({timeout:60000});
        const snapshot=()=>page.evaluate(()=>({position:window.timeScrollQA.state.save.position,x:window.timeScrollQA.state.save.timeScrollRuntime.x,found:window.timeScrollQA.state.save.timeScrollProgress?.cities['fixture-city']||[],buff:window.timeScrollQA.state.save.dailyLanguageBuff,inventory:window.timeScrollQA.state.save.inventory}));
        const initial=await snapshot();await page.locator('.time-scroll-stage canvas').focus();await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');
        await page.waitForTimeout(100);assert.ok((await page.evaluate(()=>window.timeScrollQA.state.save.timeScrollRuntime.x))<initial.x);
        for(const [label,clue]of [['约100年前','地图卡片'],['约50年前','方向路牌'],['约10年前','时光便笺']]){
            const tick=page.getByRole('button',{name:label,exact:true});if(width===390)await tick.tap();else await tick.click();
            await page.getByRole('button',{name:clue,exact:true}).click();await page.getByRole('heading',{name:`已发现 · ${clue}`,exact:true}).waitFor();await page.getByRole('button',{name:'关闭时光详情',exact:true}).click();
        }
        assert.equal((await snapshot()).found.length,3);
        await page.getByRole('button',{name:'约10年前',exact:true}).click();await page.waitForTimeout(100);
        assert.ok(sceneryResponses.length>0,'registered street WebP atlases loaded from CDN');
        await page.screenshot({path:path.join(root,`tmp/time-scroll-${width}-scene.png`)});
        await page.getByRole('button',{name:'记事旅人 · 交谈',exact:true}).click();await page.getByRole('button',{name:'练习双语对话',exact:true}).click();
        const chat=page.getByRole('dialog',{name:'时光旅人双语对话',exact:true});await chat.waitFor();await page.screenshot({path:path.join(root,`tmp/time-scroll-${width}-dialogue.png`)});
        await chat.getByRole('button',{name:'输入',exact:true}).click();
        for(const answer of ['We are thinking about the past.','Some things change.','We can look for old records.']){
            await chat.getByRole('textbox').fill(answer);await chat.getByRole('button',{name:'发送',exact:true}).click();
        }
        await page.getByText('交流完成',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.timeScrollQA.state.save.languageAdventure.stories.en['time-scroll:common:change'].completed),1);
        const result=await snapshot();assert.equal(result.buff,undefined);assert.deepEqual(result.inventory,initial.inventory);assert.deepEqual(result.position,initial.position);
        await chat.getByRole('button',{name:'关闭营地对话',exact:true}).click();await page.getByRole('button',{name:'关闭时光详情',exact:true}).click();
        await page.getByRole('button',{name:'今日加成',exact:true}).click();await page.getByRole('heading',{name:'今日语言加成',exact:true}).waitFor();await page.keyboard.press('Escape');
        await page.getByRole('button',{name:'回到城市',exact:true}).click();await page.getByRole('button',{name:'进入示例城市的时光长卷',exact:true}).click();
        await page.getByRole('button',{name:'约10年前',exact:true}).click();await page.getByRole('button',{name:'已发现 · 时光便笺',exact:true}).click();await page.getByRole('heading',{name:'已发现 · 时光便笺',exact:true}).waitFor();assert.equal((await snapshot()).found.length,3);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.close();
    }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
