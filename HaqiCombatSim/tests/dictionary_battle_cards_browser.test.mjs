import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('dictionary shows the same mixed recent ten as battle and plain navigation',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/tests/fixtures/dictionary-battle-cards.html`;
 const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.dictionary-battle-card').first().waitFor({state:'attached'});assert.equal(await page.locator('.dictionary-battle-shelf').isVisible(),false);assert.equal(await page.locator('.dictionary-battle-card canvas').count(),10);
 const names=await page.locator('.dictionary-battle-card').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));assert.equal(names[0],'练习文字卡：No, stay back.');
 assert.equal(await page.locator('.dictionary-task-action').count(),3);assert.equal(await page.locator('.dictionary-task .primary').count(),0);
 assert.equal(await page.locator('.dictionary-lang-tabs').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
 assert.equal(await page.locator('.dictionary-shell .modal-header').evaluate(n=>getComputedStyle(n).backgroundImage),'none');
 assert.equal(await page.locator('.dictionary-body').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 assert.equal(await page.locator('.dictionary-body').evaluate(n=>n.firstElementChild.classList.contains('dictionary-battle-shelf')),true);
 assert.equal(await page.locator('.dictionary-lang-tabs button').first().textContent(),'战斗文字卡');
 await page.getByRole('button',{name:'战斗文字卡',exact:true}).click();
 assert.equal(await page.locator('.dictionary-hero').isVisible(),false);
 assert.equal(await page.locator('.dictionary-toolbar').isVisible(),false);
 assert.equal(await page.locator('.dictionary-battle-shelf').isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'战斗文字卡',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.dictionary-shell').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 await page.screenshot({path:path.join(root,`tmp/dictionary-battle-cards-${width}.png`)});
 await page.getByRole('button',{name:'英文 · Word',exact:true}).click();await page.locator('.dictionary-battle-card').first().waitFor({state:'attached'});assert.equal(await page.locator('.dictionary-battle-shelf').isVisible(),false);assert.deepEqual(await page.locator('.dictionary-battle-card').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label'))),names);
 assert.equal(await page.locator('.dictionary-toolbar').isVisible(),true);
 await page.getByRole('button',{name:'战斗文字卡',exact:true}).click();await page.locator('.dictionary-battle-card').first().click();await page.getByRole('heading',{name:'Word · no'}).waitFor();
 await page.goto(base+'?role=empty');await page.getByRole('button',{name:'战斗文字卡',exact:true}).click();await page.locator('.dictionary-battle-empty').waitFor();assert.equal(await page.locator('.dictionary-battle-card').count(),0);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
