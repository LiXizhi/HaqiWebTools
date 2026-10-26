import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('real card faces and activation work at desktop/mobile sizes, including retry, voice and handwriting',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:180000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/word-cards.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    try{for(const width of [1280,390]){
        const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
        await page.goto(base);await page.waitForFunction(()=>window.wordTest);assert.equal(await page.locator('.hand-card').count(),8);
        await page.evaluate(()=>wordTest.open());
        await page.locator('.word-card-dialogue .dialogue-read-line').click();assert.equal(await page.evaluate(()=>wordTest.spoken),1);
        assert.equal(await page.locator('.word-card-dialogue .camp-chat-map').count(),1);
        assert.equal(await page.getByRole('progressbar',{name:'朗读通过进度'}).getAttribute('aria-valuenow'),'0');
        await page.getByRole('button',{name:'收起提示',exact:true}).click();assert.equal(await page.locator('.word-card-dialogue .camp-chat-hint').isVisible(),false);
        await page.getByRole('button',{name:'显示提示',exact:true}).click();await page.getByRole('button',{name:'输入',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'文字回答',exact:true}).isVisible(),true);await page.getByRole('button',{name:'输入',exact:true}).click();
        await page.getByRole('button',{name:'改用拼写',exact:true}).click();assert.equal(await page.evaluate(()=>wordTest.paused),true);assert.equal(await page.locator('.word-practice-showcase').isVisible(),false);
        await page.getByRole('textbox',{name:'目标语言词语'}).fill('helo');await page.getByRole('button',{name:'检查拼写',exact:true}).click();await page.getByRole('status').filter({hasText:'再试一次'}).waitFor();assert.equal(await page.evaluate(()=>wordTest.accepted),0);
        await page.evaluate(()=>wordTest.fail(true));await page.getByRole('textbox',{name:'目标语言词语'}).fill('hello');await page.getByRole('button',{name:'检查拼写',exact:true}).click();await page.getByRole('button',{name:'重试保存',exact:true}).waitFor();assert.equal(await page.evaluate(()=>wordTest.accepted),0);
        await page.screenshot({path:path.join(root,`tmp/word-cards-${width}-practice.png`)});await page.evaluate(()=>wordTest.fail(false));await page.getByRole('button',{name:'重试保存',exact:true}).click();await page.locator('.word-practice').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>wordTest.accepted),1);assert.equal(await page.evaluate(()=>wordTest.paused),false);
        assert.equal(await page.getByRole('button',{name:'已激活',exact:true}).count(),0);assert.equal(await page.evaluate(()=>wordTest.battle.sides.near[0].deckMap[Number(Object.keys(wordTest.battle.sides.near[0].wordCards)[0])]),-2);
        await page.goto(base+'?word=zh:huo');await page.waitForFunction(()=>window.wordTest);await page.evaluate(()=>wordTest.open());await page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true}).waitFor();
        await page.evaluate(()=>wordTest.setTranscript('火'));await page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.word-practice-mic')?.textContent==='结束');await page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true}).click();await page.getByRole('status').filter({hasText:'再试一次'}).waitFor();
        await page.evaluate(()=>wordTest.setTranscript(wordTest.rows.find(r=>r.id==='zh:huo').readText));await page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.word-practice-mic')?.textContent==='结束');await page.getByRole('button',{name:'按住对话，松开发送；点击录制，再点结束；滑出取消',exact:true}).click();await page.locator('.word-practice').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>wordTest.audio instanceof Blob),true);
        await page.screenshot({path:path.join(root,`tmp/word-cards-${width}-activated.png`)});
        await page.goto(base+'?word=zh:shan');await page.waitForFunction(()=>window.wordTest);await page.evaluate(()=>wordTest.open());await page.locator('.word-practice-writing').waitFor();
        assert.equal(await page.locator('.word-practice-showcase .spell-face').count(),1);assert.equal(await page.locator('.word-practice-strokes canvas').count(),3);
        assert.equal(await page.locator('.word-practice').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
        await page.screenshot({path:path.join(root,`tmp/word-cards-${width}-art.png`)});
        assert.equal(await page.getByRole('button',{name:'看演示',exact:true}).count(),1);
        const strokes=JSON.parse(await readFile(path.join(root,'data/adventure/dictionary/zh.json'),'utf8')).entries.find(e=>e.id==='shan').strokes.medians;
        await page.locator('.word-practice-writing').scrollIntoViewIfNeeded();const box=await page.locator('.word-practice-writing').boundingBox();
        // A wrong-direction first stroke is rejected immediately and removed automatically.
        const inkPixels=()=>page.locator('.word-practice-writing').evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i]<100&&data[i+1]<140&&data[i+2]<140)count++;return count;});
        await page.mouse.move(box.x+box.width*.5,box.y+box.height*.8);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.1);await page.mouse.up();
        await page.waitForFunction(()=>!document.querySelector('.word-practice-mic').disabled);assert.equal(await inkPixels(),0,'wrong stroke is removed from the canvas');assert.equal(await page.locator('.word-practice [role=status]').textContent(),'');
        assert.equal(await page.evaluate(()=>wordTest.accepted),0);
        for(const [strokeIndex,stroke] of strokes.entries()){for(let i=0;i<stroke.length;i++){const [x,y]=stroke[i];await page.mouse.move(box.x+x/1024*box.width,box.y+(900-y)/1024*box.height);if(i===0)await page.mouse.down();}await page.mouse.up();if(strokeIndex===0){assert.ok(await inkPixels()>500,'accepted stroke has solid standard ink');assert.equal(await page.locator('.word-practice [role=status]').textContent(),'');await page.screenshot({path:path.join(root,`tmp/word-standard-stroke-${width}.png`)});}}
        await page.screenshot({path:path.join(root,`tmp/word-cards-${width}-writing.png`)});await page.locator('.word-practice').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>wordTest.accepted),1);
        if(width===1280){
            const mic=()=>page.locator('.word-practice-mic');
            const speak=async value=>{await page.evaluate(v=>wordTest.setTranscript(v),value);await mic().click();await page.waitForFunction(()=>document.querySelector('.word-practice-mic')?.textContent==='结束');await mic().click();};
            await page.goto(base+'?word=zh:shan');await page.waitForFunction(()=>window.wordTest);await page.evaluate(()=>wordTest.open());await mic().waitFor();
            for(let n=1;n<=3;n++){await speak('大山挡在前面');if(n<3)await page.getByRole('status').filter({hasText:`${n}/3`}).waitFor();}
            await page.locator('.word-practice').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>wordTest.accepted),1);
            await page.goto(base+'?word=zh:shan');await page.waitForFunction(()=>window.wordTest);await page.evaluate(()=>wordTest.open());await mic().waitFor();
            for(let n=1;n<=3;n++){await speak('完全无关');await page.getByRole('status').filter({hasText:n===3?'已练习三次':`${n}/3`}).waitFor();}
            assert.equal(await mic().isDisabled(),true);assert.equal(await page.evaluate(()=>wordTest.accepted),0);
            await page.evaluate(()=>wordTest.practice.close());await page.evaluate(()=>wordTest.open());await mic().waitFor();
            await page.evaluate(()=>{wordTest.delayFinish();wordTest.setTranscript('大山挡在前面，保护伙伴。');});
            // Hold and release uses the same recorder; close before its late ASR result.
            await mic().scrollIntoViewIfNeeded();const rect=await mic().boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
            await page.getByRole('status').filter({hasText:'正在识别'}).waitFor();await page.getByRole('button',{name:'关闭文字卡练习'}).click();await page.evaluate(()=>wordTest.releaseFinish());
            await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>wordTest.accepted),0);assert.equal(await page.evaluate(()=>wordTest.paused),false);
        }
        await page.goto(base.replace('/tests/fixtures/word-cards.html','/Haqi.html'));await page.locator('.game-title').waitFor({timeout:60000});
        assert.deepEqual(errors,[]);await context.close();
    }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
