import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('dictionary inputs remain usable when the available viewport height shrinks',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:30000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/dictionary.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    try{
        const page=await browser.newPage({viewport:{width:390,height:900},hasTouch:true});page.setDefaultTimeout(5000);
        async function shrink(input,label){
            await input.fill('hello');await input.focus();await page.setViewportSize({width:390,height:420});
            await page.waitForFunction(node=>{
                const input=node.getBoundingClientRect(),body=node.closest('.dictionary-body').getBoundingClientRect(),submit=node.nextElementSibling.getBoundingClientRect();
                return input.top>=body.top&&input.bottom<=body.bottom&&submit.top>=body.top&&submit.bottom<=body.bottom;
            },await input.elementHandle(),{timeout:2000});
            const box=await input.boundingBox(),body=await page.locator('.dictionary-body').boundingBox();
            assert.ok(box.y>=body.y&&box.y+box.height<=body.y+body.height,label+' stays within the scrollable panel');
            const submitBox=await input.evaluate(n=>{const r=n.nextElementSibling.getBoundingClientRect();return {top:r.top,bottom:r.bottom};});assert.ok(submitBox.top>=body.y&&submitBox.bottom<=body.y+body.height,label+' submit remains visible too');
            assert.equal(await input.evaluate(n=>n===document.activeElement),true);assert.equal(await input.inputValue(),'hello');
            const close=await page.getByRole('button',{name:'关闭字典',exact:true}).boundingBox();assert.ok(close.y>=0&&close.y+close.height<=420);
            await page.screenshot({path:path.join(root,`tmp/dictionary-short-viewport-${label}.png`)});
        }
        await page.goto(base+'?entry=hello&role=short-viewport');await page.getByRole('button',{name:'准备好了，试着回忆',exact:true}).click();await page.getByRole('button',{name:'你好',exact:true}).click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();
        await page.goto(base+'?entry=hello&role=short-viewport&day=1');await shrink(page.getByRole('textbox',{name:'英文拼写'}),'spelling');
        const spelling=page.getByRole('textbox',{name:'英文拼写'}),spellSubmit=page.getByRole('button',{name:'提交拼写',exact:true});
        for(const via of ['keyboard','button']){
            await spelling.fill('hallo');if(via==='keyboard')await spelling.press('Enter');else await spellSubmit.click();
            await page.locator('.dictionary-practice-feedback').filter({hasText:'其余字母都写对了'}).waitFor();await page.waitForTimeout(100);
            const bounds=await page.locator('.dictionary-body').boundingBox(),inputBox=await spelling.boundingBox(),submitBox=await spellSubmit.boundingBox();
            assert.ok(inputBox.y>=bounds.y&&submitBox.y+submitBox.height<=bounds.y+bounds.height,'spelling input and submit stay visible after '+via+' feedback');
            assert.equal(await spelling.evaluate(n=>n===document.activeElement),true);assert.equal(await spelling.inputValue(),'hallo');assert.equal(await page.locator('#qa').textContent(),'加成 0');
        }
        await page.screenshot({path:path.join(root,'tmp/dictionary-spelling-retry-controls-390.png')});await spelling.fill('hello');await spellSubmit.click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();
        await page.goto(base+'?entry=hello&role=spelling-focus-away');await page.getByRole('button',{name:'准备好了，试着回忆',exact:true}).click();await page.getByRole('button',{name:'你好',exact:true}).click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();
        await page.goto(base+'?entry=hello&role=spelling-focus-away&day=1&delayedSpellingFeedback=1');await spelling.fill('hallo');await spelling.press('Enter');await page.locator('#qa[data-spelling-save=pending]').waitFor();const home=page.getByRole('button',{name:'返回今日任务',exact:true});await home.focus();const scrollBefore=await page.locator('.dictionary-body').evaluate(n=>n.scrollTop);await page.locator('#qa[data-spelling-save=settled]').waitFor();await page.locator('.dictionary-practice-feedback').filter({hasText:'其余字母都写对了'}).waitFor();await page.waitForTimeout(100);assert.equal(await home.evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('.dictionary-body').evaluate(n=>n.scrollTop),scrollBefore);assert.equal(await page.locator('#qa').textContent(),'加成 0');
        await page.setViewportSize({width:390,height:900});await page.goto(base+'?entry=hello&role=short-tutor');await page.locator('.dictionary-tutor summary').click();await shrink(page.getByRole('textbox',{name:'向小老师提问'}),'tutor');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.dictionary-tutor-turn.teacher').waitFor();assert.equal(await page.locator('#qa').textContent(),'加成 0');
        await page.setViewportSize({width:390,height:900});const question=page.getByRole('textbox',{name:'向小老师提问'});await question.fill('');const compact=await question.boundingBox();const draft='我想向新朋友问好。\n可以只说 hello 吗？\n第一次见面时怎么说更自然？\n请给我一个简单的例子。';await question.fill(draft);const expanded=await question.boundingBox();assert.ok(expanded.height>compact.height+20,'long questions expand beyond two rows');assert.ok(expanded.height<=160,'composer leaves room for the conversation');assert.equal(await question.inputValue(),draft);
        await question.fill('想请教一个问题。'.repeat(60));assert.ok((await question.boundingBox()).height<=160);await question.fill(draft);await page.getByRole('button',{name:'返回今日任务',exact:true}).click();await page.locator('[data-entry-id=hello]').click();assert.equal(await question.inputValue(),draft);assert.ok((await question.boundingBox()).height>compact.height+20,'restored draft expands too');await question.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tmp/dictionary-growing-question-390.png')});await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.dictionary-tutor-turn.teacher').nth(1).waitFor();assert.equal(await question.inputValue(),'');assert.ok((await question.boundingBox()).height<=compact.height+1,'sending returns to compact height');assert.equal(await page.locator('#qa').textContent(),'加成 0');
        await page.setViewportSize({width:390,height:900});await page.goto(base+'?contextRetry=1&role=short-context');await page.getByRole('article').filter({has:page.getByRole('heading',{name:'今天会用了'})}).getByRole('button',{name:'开始学习'}).click();const answer=page.getByRole('textbox',{name:'情境题回答'});await shrink(answer,'context');await answer.fill('Goodbye');await page.getByRole('button',{name:'提交回答',exact:true}).click();await page.getByRole('status').filter({hasText:'试着用 hello'}).waitFor();await page.waitForTimeout(100);const retryBounds=await page.locator('.dictionary-body').boundingBox(),retryInput=await answer.boundingBox(),retrySubmit=await page.getByRole('button',{name:'提交回答',exact:true}).boundingBox();assert.ok(retryInput.y>=retryBounds.y&&retrySubmit.y+retrySubmit.height<=retryBounds.y+retryBounds.height,'answer and submit stay visible after feedback appears');assert.equal(await answer.evaluate(n=>n===document.activeElement),true);await answer.fill('Hel');assert.match(await page.locator('.dictionary-context-feedback').textContent(),/^上次回答的建议：试着用 hello/);assert.equal(await answer.inputValue(),'Hel');assert.equal(await page.locator('#qa').textContent(),'加成 0');await answer.fill('Hell');assert.equal((await page.locator('.dictionary-context-feedback').textContent()).match(/上次回答的建议/g).length,1);await page.screenshot({path:path.join(root,'tmp/dictionary-context-previous-feedback-390.png')});await answer.fill('Hello!');await page.getByRole('button',{name:'提交回答',exact:true}).click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();
    }finally{await browser.close();await new Promise(r=>server.close(r));}
});
