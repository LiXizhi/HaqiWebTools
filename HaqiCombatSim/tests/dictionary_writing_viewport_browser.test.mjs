import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Chinese writing fits short viewports and preserves strokes across rotation',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:30000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/dictionary.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    const data=JSON.parse(await readFile(path.join(root,'data/adventure/dictionary/zh.json'),'utf8')),entry=data.entries.find(e=>e.id==='ri');
    try{for(const viewport of [{width:844,height:390},{width:390,height:420}]){
        const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(5000);
        await page.goto(base+'?language=zh&entry=ri&role=writing-rotation-'+viewport.width);
        const canvas=page.locator('canvas.dictionary-writing');await canvas.waitFor();
        async function draw(rows){await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();for(const stroke of rows){const points=stroke.map(([x,y])=>[box.x+x/1024*box.width,box.y+(900-y)/1024*box.height]);await page.mouse.move(...points[0]);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(...p,{steps:3});await page.mouse.up();}}
        await draw(entry.strokes.medians.slice(0,2));await page.setViewportSize(viewport);await canvas.scrollIntoViewIfNeeded();
        const box=await canvas.boundingBox(),body=await page.locator('.dictionary-body').boundingBox();
        assert.ok(box.y>=body.y-1&&box.y+box.height<=body.y+body.height+1,'the entire writing square fits the visible panel');assert.ok(Math.abs(box.width-box.height)<1,'writing proportions remain square');
        assert.equal(await page.locator('.dictionary-writing-progress').innerText(),'已写 2 / 4 笔');
        const close=await page.getByRole('button',{name:'关闭字典',exact:true}).boundingBox();assert.ok(close.y>=0&&close.y+close.height<=viewport.height);
        await page.screenshot({path:path.join(root,`tmp/dictionary-writing-rotation-${viewport.width}.png`)});
        await draw(entry.strokes.medians.slice(2));await page.getByRole('button',{name:'完成书写',exact:true}).click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();assert.equal(await page.locator('#qa').textContent(),'加成 1');await page.close();
    }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
