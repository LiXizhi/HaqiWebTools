import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('dictionary form correction and cross-language teaching preserve practice and audio language',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:30000},async()=>{
    const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
    const server=http.createServer(async(req,res)=>{try{const target=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!target.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}const body=await readFile(target);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(target)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/dictionary.html`;
    const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
    try{for(const width of [1280,390]){
        const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(5000);
        const data=JSON.parse(await readFile(path.join(root,'data/adventure/dictionary/en.json'),'utf8'));
        for(const id of ['child','write']){
            const entry=data.entries.find(e=>e.id===id),form=id==='child'?'children':'wrote',note=entry.formNotes[form],role='form-correction-'+id;
            await page.goto(base+'?entry='+id+'&role='+role);
            await page.getByRole('button',{name:'准备好了，试着回忆',exact:true}).click();
            await page.getByRole('button',{name:entry.meaning,exact:true}).click();
            await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();
            await page.goto(base+'?entry='+id+'&role='+role+'&day=1');
            const input=page.getByRole('textbox',{name:'英文拼写'});await input.fill(form);await input.press('Enter');
            await page.locator('.dictionary-practice-feedback').filter({hasText:'另一种词形'}).waitFor();
            await page.getByRole('button',{name:'请小老师讲讲',exact:true}).click();
            const reply=page.locator('.dictionary-tutor-turn.teacher');await reply.waitFor();
            assert.ok((await reply.innerText()).includes(note.explanation));assert.ok((await reply.innerText()).includes(note.translation));
            assert.equal(await page.locator('.dictionary-tutor-question').count(),0);assert.equal(await page.locator('#qa').textContent(),'加成 0');
            await page.getByRole('button',{name:'朗读例句：'+note.example,exact:true}).click();
            await page.locator('.dictionary-tutor-audio-status').filter({hasText:'发音暂不可用'}).waitFor();
            await reply.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`tmp/dictionary-form-correction-${id}-${width}.png`)});
            await page.getByRole('button',{name:'回到练习',exact:true}).click();
            assert.equal(await input.inputValue(),form);assert.equal(await input.evaluate(n=>n===document.activeElement),true);assert.equal(await page.locator('#qa').textContent(),'加成 0');
            await input.fill(entry.text);await input.press('Enter');await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();assert.equal(await page.locator('#qa').textContent(),'加成 1');
            await page.reload();await page.locator('.dictionary-learning-status').filter({hasText:'今日已练习'}).waitFor();assert.equal(await page.locator('#qa').textContent(),'加成 1');await page.getByRole('button',{name:entry.meaning,exact:true}).click();await page.getByRole('button',{name:'继续今日任务',exact:true}).waitFor();assert.equal(await page.locator('#qa').textContent(),'加成 1');
        }
        await page.goto(base+'?language=zh&entry=yue&role=cross-language&crossLanguage=1');await page.locator('.dictionary-tutor summary').click();
        const question=page.getByRole('textbox',{name:'向小老师提问'}),send=page.getByRole('button',{name:'发送',exact:true}),qa=page.locator('#qa');
        await question.fill('月份英文怎么说？');await send.click();await page.locator('.dictionary-tutor-turn.teacher').waitFor();
        const listen=page.getByRole('button',{name:'朗读例句：one month',exact:true});await listen.click();await page.locator('.dictionary-tutor-audio-status').filter({hasText:'发音暂不可用'}).waitFor();assert.equal(await qa.getAttribute('data-spoken-locale'),'en');assert.equal(await listen.isEnabled(),true);
        assert.equal(await page.locator('.dictionary-tutor-turn.teacher blockquote').getAttribute('lang'),'en');assert.equal(await page.locator('.dictionary-tutor-turn.teacher blockquote small').getAttribute('lang'),'zh-CN');
        await page.getByRole('button',{name:'关闭字典',exact:true}).click();await page.locator('[data-entry-id=yue]').click();await page.locator('.dictionary-tutor summary').waitFor();if(await page.locator('.dictionary-tutor').getAttribute('open')===null)await page.locator('.dictionary-tutor summary').click();await listen.click();await page.locator('.dictionary-tutor-audio-status').filter({hasText:'发音暂不可用'}).waitFor();assert.equal(await qa.getAttribute('data-spoken-locale'),'en');
        await page.getByRole('button',{name:'听发音',exact:true}).click();await page.locator('.dictionary-entry-audio-status').filter({hasText:'发音暂不可用'}).waitFor();assert.equal(await page.locator('.dictionary-notice').textContent(),'');assert.equal(await qa.getAttribute('data-spoken-locale'),'zh-CN');
        await question.fill('再简单一点');await send.click();await page.locator('.dictionary-tutor-turn.teacher').nth(1).waitFor();assert.equal(await qa.getAttribute('data-tutor-calls'),'2');
        await question.fill('不用英语，用中文说月份');await send.click();const lastReply=page.locator('.dictionary-tutor-turn.teacher').nth(2);await lastReply.waitFor();assert.equal(await lastReply.locator('blockquote').getAttribute('lang'),'zh-CN');assert.equal(await lastReply.locator('blockquote small').count(),0);
        await page.getByRole('button',{name:'朗读例句：一月是一年的第一个月。',exact:true}).click();await page.locator('.dictionary-tutor-audio-status').filter({hasText:'发音暂不可用'}).waitFor();assert.equal(await qa.getAttribute('data-spoken-locale'),'zh-CN');assert.equal(await qa.getAttribute('data-tutor-calls'),'3');assert.equal(await qa.textContent(),'加成 0');
        await lastReply.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,`tmp/dictionary-cross-language-${width}.png`)});
        await page.close();
    }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
