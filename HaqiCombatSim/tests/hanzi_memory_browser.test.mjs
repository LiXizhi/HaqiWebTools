import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('island exploration opens one dictionary exercise and never creates collection fragments',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:240000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(root)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp/hanzi-memory'),{recursive:true});
    try{
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(base+'/tests/fixtures/hanzi-memory.html');await page.waitForFunction(()=>!!window.memoryTest,null,{timeout:120000}).catch(error=>{throw Error(error.message+' / '+errors.join(';'));});
        assert.equal(await page.locator('.tracker-quest').first().locator('.tracker-follow').count(),2);
        await page.evaluate(()=>{memoryTest.pause(true);memoryTest.gotoNode();});await page.screenshot({path:path.join(root,'tmp/hanzi-memory/scene.png')});
        for(const width of [1280,390]){
            await page.setViewportSize({width,height:900});await page.evaluate(()=>memoryTest.pending('shan'));await page.locator('.word-practice-writing').waitFor();
            assert.equal(await page.locator('.memory-card').count(),0);
            const strokes=JSON.parse(await readFile(path.join(root,'data/adventure/dictionary/zh.json'),'utf8')).entries.find(e=>e.id==='shan').strokes.medians;
            await page.locator('.word-practice-writing').scrollIntoViewIfNeeded();const box=await page.locator('.word-practice-writing').boundingBox();
            for(const stroke of strokes){for(let i=0;i<stroke.length;i++){const [x,y]=stroke[i];await page.mouse.move(box.x+x/1024*box.width,box.y+(900-y)/1024*box.height);if(i===0)await page.mouse.down();}await page.mouse.up();}
            await page.screenshot({path:path.join(root,`tmp/hanzi-memory/practice-${width}.png`)});await page.locator('.word-practice').waitFor({state:'detached'});
            assert.equal(await page.evaluate(()=>memoryTest.save.hanzi?.memories),undefined);assert.equal(await page.evaluate(()=>memoryTest.save.hanziMemoryRuntime.pending),undefined);
            assert.equal(await page.evaluate(()=>memoryTest.save.quests[873100].progress['hanzi:shan']),1);
        }
        assert.deepEqual(errors,[]);
    }finally{await browser.close();await new Promise(r=>server.close(r));}
});
