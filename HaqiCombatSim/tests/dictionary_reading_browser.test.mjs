import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('late example explanation respects learner scrolling and typing',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:30000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/dictionary.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    try{for(const width of [1280,390]){
        const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(5000);
        for(const action of ['scroll','type','collapse']){
            await page.goto(base+'?entry=hello&streamingTutor=1&role=reading-'+action);
            await page.getByText('读懂这句话',{exact:true}).click();
            await page.getByRole('button',{name:'请小老师讲讲这句话',exact:true}).click();
            await page.locator('.dictionary-tutor-preview').waitFor();assert.equal(await page.locator('.dictionary-tutor-log').getAttribute('aria-busy'),'true');
            const body=page.locator('.dictionary-body'),summary=page.locator('.dictionary-tutor summary');
            if(action==='scroll'){
                const bounds=await body.boundingBox();await page.mouse.move(bounds.x+20,bounds.y+30);await page.mouse.wheel(0,-2000);
                await page.waitForFunction(()=>document.querySelector('.dictionary-body').scrollTop===0);
                assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
            }else if(action==='type')await page.getByRole('textbox',{name:'向小老师提问'}).fill('我还想问另一个问题');
            else await summary.click();
            await page.locator('.dictionary-tutor-turn.teacher:not(.dictionary-tutor-preview)').waitFor({state:'attached'});assert.equal(await page.locator('.dictionary-tutor-log').getAttribute('aria-busy'),'false');assert.equal(await page.locator('.dictionary-tutor-turn.teacher blockquote').getAttribute('lang'),'en');assert.equal(await page.locator('.dictionary-tutor-turn.teacher blockquote small').getAttribute('lang'),'zh-CN');
            if(action==='scroll'){
                assert.ok(await body.evaluate(n=>n.scrollTop)<=2,'new reply must not pull the learner away from the word');
                await page.screenshot({path:path.join(root,`tmp/dictionary-preserve-reading-${width}.png`)});
            }
            else if(action==='type'){
                const input=page.getByRole('textbox',{name:'向小老师提问'});assert.equal(await input.inputValue(),'我还想问另一个问题');assert.equal(await input.evaluate(n=>n===document.activeElement),true);
            }else{
                assert.equal(await page.locator('.dictionary-tutor').getAttribute('open'),null);assert.equal(await summary.textContent(),'小老师有新回复');assert.equal(await summary.evaluate(n=>n===document.activeElement),true);
                await page.getByRole('button',{name:'返回今日任务',exact:true}).click();await page.locator('[data-entry-id=hello]').click();assert.equal(await summary.textContent(),'小老师有新回复');assert.equal(await page.locator('.dictionary-tutor').getAttribute('open'),null);await summary.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`tmp/dictionary-unread-reply-${width}.png`)});await summary.click();await page.getByText('不明白？问问小老师',{exact:true}).waitFor();assert.equal(await page.locator('.dictionary-tutor-turn.teacher:not(.dictionary-tutor-preview)').count(),1);
            }
            assert.equal(await page.locator('#qa').textContent(),'加成 0');
        }
        await page.goto(base+'?entry=home&role=long-reading');await page.locator('.dictionary-tutor summary').click();const input=page.getByRole('textbox',{name:'向小老师提问'}),log=page.locator('.dictionary-tutor-log');
        await input.fill('home 和 family 有什么区别？');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.dictionary-tutor-turn.teacher').waitFor();
        const startVisible=async()=>{const row=await page.locator('.dictionary-tutor-turn.teacher').last().boundingBox(),bounds=await log.boundingBox();assert.ok(row.y>=bounds.y-2&&row.y<bounds.y+bounds.height,'the beginning of the latest explanation is visible');};
        await startVisible();await log.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`tmp/dictionary-long-reply-start-${width}.png`)});
        await log.focus();await page.keyboard.press('Control+Home');await page.waitForFunction(()=>document.querySelector('.dictionary-tutor-log').scrollTop===0);const before=await log.evaluate(n=>n.scrollTop);await input.fill('home 和 family 有什么区别？');await page.getByRole('button',{name:'发送',exact:true}).click();await page.locator('.dictionary-tutor-turn.teacher').nth(1).waitFor();assert.equal(await log.evaluate(n=>n.scrollTop),before,'reading earlier messages does not jump');
        await page.getByRole('button',{name:'查看最新回复',exact:true}).click();await startVisible();assert.equal(await log.evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#qa').textContent(),'加成 0');await page.close();
    }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
