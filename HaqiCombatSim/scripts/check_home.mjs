import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(opt('--playwright','playwright'));
const url=opt('--url','http://127.0.0.1:8786'),out=opt('--out','tmp/home-browser');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 if(args.includes('--main')){
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
  await page.goto(`${url}/tests/fixtures/local-coop.html`);await page.waitForURL('**/Haqi.html?assets=local',{timeout:120000});
  await page.getByRole('button',{name:'继续旅程',exact:true}).first().click({timeout:120000});
  await page.getByRole('button',{name:'宠物',exact:true}).waitFor({timeout:120000});await page.getByRole('button',{name:'宠物',exact:true}).click();await page.getByRole('button',{name:'宠物家园',exact:true}).click();
  page.once('dialog',dialog=>dialog.accept('正式入口家园'));await page.getByRole('button',{name:'新建家园',exact:true}).click();await page.locator('.home-canvas').waitFor();
  await page.getByRole('button',{name:'语音召唤',exact:true}).click();
  await page.getByRole('textbox',{name:'召唤句子'}).fill('I want a chair.');await page.getByRole('button',{name:'召唤',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.home-status')?.textContent==='已保存到本机');
  await page.screenshot({path:`out/main.png`.replace('out/',`${out}/`),fullPage:true});await page.getByRole('button',{name:'家园列表',exact:true}).click();await page.getByRole('button',{name:'哈奇世界',exact:true}).click();await page.getByRole('button',{name:'家园',exact:true}).click();await page.getByRole('button',{name:'正式入口家园',exact:true}).waitFor();console.log(JSON.stringify({main:'passed',checks:'pet home, summon, return to map, map home tab'}));await context.close();
 }
 for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}/tests/fixtures/home.html`);await page.waitForFunction(()=>window.homeQA?.ready);
 page.once('dialog',dialog=>dialog.accept('我的小镇'));await page.getByRole('button',{name:'新建家园',exact:true}).click();await page.locator('.home-canvas').waitFor();
 await page.getByRole('button',{name:'语音召唤',exact:true}).click();
 const input=page.getByRole('textbox',{name:'召唤句子'}),summon=async sentence=>{await input.fill(sentence);await page.getByRole('button',{name:'召唤',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.home-status').textContent==='已保存到本机');};
 await summon('I want a red flower.');await summon('Create a table.');await summon('I want a bed.');
 await page.getByRole('button',{name:'仓库',exact:true}).click();await page.getByRole('button',{name:'床',exact:true}).click();await page.locator('.home-sidebar').getByRole('button',{name:'关闭',exact:true}).click();const canvas=page.locator('.home-canvas'),rect=await canvas.boundingBox();
 await canvas.click({position:{x:rect.width*.5,y:rect.height*.35}});await page.waitForTimeout(150);
 const snapshot=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0];return homeQA.store.snapshot(h.id);});assert.equal(Object.values(snapshot.parts).flatMap(v=>Object.values(v)).filter(v=>v?.itemId==='bed').length,1);assert.equal(snapshot.parts.inventory['bed:'],0);
 const bed=Object.values(snapshot.parts).flatMap(v=>Object.values(v)).find(v=>v?.itemId==='bed');
 await page.mouse.move(rect.x+rect.width/2+(bed.x+1)*40,rect.y+rect.height/2+(bed.y+1)*40);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.65,rect.y+rect.height*.4,{steps:8});await page.mouse.up();await page.waitForTimeout(200);
 const moved=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0],s=await homeQA.store.snapshot(h.id);return Object.values(s.parts).flatMap(v=>Object.values(v)).find(v=>v?.itemId==='bed');});assert.notDeepEqual([moved.x,moved.y],[bed.x,bed.y]);
 await canvas.click({position:{x:rect.width/2+(moved.x+.5)*40,y:rect.height/2+(moved.y+.5)*40}});await page.getByRole('button',{name:'旋转',exact:true}).click();await page.waitForTimeout(100);
 const rotated=await page.evaluate(async()=>{const h=(await homeQA.store.list())[0],s=await homeQA.store.snapshot(h.id);return Object.values(s.parts).flatMap(v=>Object.values(v)).find(v=>v?.itemId==='bed');});assert.equal(rotated.rotation,1);
 await page.getByRole('button',{name:'居民',exact:true}).click();assert.equal(await page.locator('.home-pet-card').count(),40);await page.locator('.home-pet-card').first().getByRole('button',{name:'召到身边'}).click();await page.waitForTimeout(150);
 await page.screenshot({path:`${out}/${width}-scene.png`,fullPage:true});
 // A failed IndexedDB operation is visible, retryable, and grants only once.
 await page.getByRole('button',{name:'语音召唤',exact:true}).click();
 await page.evaluate(()=>homeQA.fail(true));await input.fill('I want a chair.');await page.getByRole('button',{name:'召唤',exact:true}).click();await page.getByRole('button',{name:'重试保存'}).waitFor();await page.evaluate(()=>homeQA.fail(false));await page.getByRole('button',{name:'重试保存'}).click();await page.waitForFunction(()=>document.querySelector('.home-status').textContent==='已保存到本机');
 await page.getByRole('button',{name:'家园列表',exact:true}).click();page.once('dialog',dialog=>dialog.accept('第二个家'));await page.getByRole('button',{name:'新建家园',exact:true}).click();await canvas.waitFor();
 const rows=await page.evaluate(()=>homeQA.store.list());assert.equal(rows.length,2);const first=rows.find(r=>r.name==='我的小镇');assert.equal((await page.evaluate(id=>homeQA.store.read(id,'inventory'),first.id))['chair:'],1);
 await page.reload();await page.waitForFunction(()=>window.homeQA?.ready);assert.equal(await page.locator('.home-entry:not(.home-new)').count(),2);await page.getByRole('button',{name:'我的小镇',exact:true}).click();await canvas.waitFor();await page.waitForTimeout(300);
 await page.getByRole('button',{name:'语音召唤',exact:true}).click();
 await page.getByRole('button',{name:'按住说话',exact:true}).click();await page.waitForFunction(async()=>{const h=(await homeQA.store.list()).find(h=>h.name==='我的小镇');return (await homeQA.store.read(h.id,'inventory'))['chair:']===2;});
 // Real IndexedDB serializes identical receipts across competing transactions.
 const atomic=await page.evaluate(async()=>{const {applyHomeAction}=await import('./js/home_actions_core.js'),catalog=await fetch('data/adventure/home/catalog.json').then(r=>r.json()),id=(await homeQA.store.list())[0].id;const go=()=>homeQA.store.mutate(id,['inventory','receipt:concurrent'],(_,p)=>applyHomeAction(p,{type:'summon',receipt:'concurrent',itemId:'chair',input:'speech'},catalog.items));const results=await Promise.all([go(),go()]);return results.map(r=>r.changed);});assert.deepEqual(atomic,[true,false]);
 const isolation=await page.evaluate(async()=>{const {createHomeStore}=await import('./js/home_store.js'),{homeScope}=await import('./js/home_core.js');const other=createHomeStore(homeScope('other-account','qa-home'),{name:'haqi-home-qa-only'});const count=(await other.list()).length;const guestCount=(await homeQA.store.listGuests()).length;await other.close();return {count,guestCount};});assert.deepEqual(isolation,{count:0,guestCount:2});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);console.log(JSON.stringify({width,status:'passed',checks:'summon, placement, drag, rotate, all pets, save retry, two homes, reload, atomic receipts, account isolation, layout'}));await context.close();
 }}finally{await browser.close();}
