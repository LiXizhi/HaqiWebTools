import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('home label editor persists text, retries failures and fits desktop/mobile',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:60000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});

 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/home-label.html`);
  const input=page.getByRole('textbox',{name:'作品标签'});await input.waitFor();
  const bounds=await page.getByRole('dialog',{name:'给作品写标签'}).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await input.fill('My story corner');await page.evaluate(()=>labelTest.fail=true);await page.getByRole('button',{name:'保存标签',exact:true}).click();
  await page.getByText('测试保存失败',{exact:true}).waitFor();assert.equal((await page.evaluate(()=>labelTest.object())).label,undefined);
  await page.evaluate(()=>labelTest.fail=false);await page.getByRole('button',{name:'保存标签',exact:true}).click();await input.waitFor({state:'detached'});
  assert.equal((await page.evaluate(()=>labelTest.object())).label,'My story corner');
  await page.reload();await input.waitFor();assert.equal(await input.inputValue(),'My story corner');
  await page.screenshot({path:path.join(root,`tmp/home-label-editor-${width}.png`)});
  await input.fill('');await page.getByRole('button',{name:'保存标签',exact:true}).click();await input.waitFor({state:'detached'});
  assert.equal((await page.evaluate(()=>labelTest.object())).label,undefined);
  await page.evaluate(()=>labelTest.open({prompt:'Write a label.',examples:['My book.','Our book.']}));
  await input.waitFor();assert.equal(await input.inputValue(),'');await page.getByText('伙伴的请求：Write a label.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'看一个例子',exact:true}).click();await page.getByText('My book. / Our book.',{exact:true}).waitFor();
  assert.equal(await input.inputValue(),'');assert.equal((await page.evaluate(()=>labelTest.object())).label,undefined);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
