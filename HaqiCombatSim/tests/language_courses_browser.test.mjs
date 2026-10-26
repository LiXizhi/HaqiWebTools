import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('desktop/mobile four-language course and card entry; home action, retry and delayed language cancellation',{skip:!process.env.HAQI_PLAYWRIGHT,timeout:120000},async()=>{
 const {chromium}=createRequire(path.resolve(process.env.HAQI_PLAYWRIGHT,'package.json'))('playwright');
 const server=http.createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(path.resolve(root)+path.sep))throw Error();res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'msedge'});await mkdir(path.join(root,'tmp'),{recursive:true});
 try{for(const width of [1280,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const enterPractice=async()=>{
   const row=await page.evaluate(()=>languageTest.current);
   if(row.interaction.kind!=='landmark'){
    await page.locator('.rpg-dialogue').waitFor();assert.equal(await page.getByRole('button',{name:'输入',exact:true}).count(),0);
    assert.ok(!(await page.locator('.dialogue-text').textContent()).includes(row.course.context));
    for(let line=0;line<10&&await page.locator('.rpg-dialogue').count();line++)await page.locator('.rpg-dialogue .dialogue-default').click();
   }
   await page.getByRole('button',{name:'输入',exact:true}).waitFor();
   assert.equal(await page.locator('.rpg-dialogue').count(),0);
   assert.equal(await page.locator('.camp-chat-scene-context').count(),0);
   assert.ok(!(await page.locator('.camp-chat-context').textContent()).includes(row.course.context));
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/language-courses.html`);await page.waitForFunction(()=>window.languageTest);
  for(const language of ['zh','en','ja','ko']){
   await page.evaluate(l=>languageTest.course(l),language);const tracker=page.locator('.quest-tracker');await tracker.getByRole('button',{name:'前往',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'学习路线',exact:true}).count(),0);
   await tracker.locator('.quest-track-title').first().click();await page.getByRole('button',{name:'前往交谈',exact:true}).waitFor();assert.equal(await page.locator('.journal-detail textarea,.journal-detail input').count(),0);
   if(language==='en')await page.screenshot({path:path.join(root,`tmp/language-scene-journal-${width}.png`)});
   await page.getByRole('button',{name:'前往交谈',exact:true}).click();
   if(language==='en'){
    await page.locator('.rpg-dialogue').waitFor();await page.screenshot({path:path.join(root,`tmp/language-intro-${width}.png`)});
    const before=await page.evaluate(()=>languageTest.state('en'));
    await page.locator('.rpg-dialogue .close-button').click();
    assert.equal(await page.locator('.camp-chat').count(),0);
    assert.deepEqual(await page.evaluate(()=>languageTest.state('en')),before);
    await tracker.getByRole('button',{name:'前往',exact:true}).click();
   }
   for(let step=0;step<4;step++){
    if(step)await tracker.getByRole('button',{name:'前往',exact:true}).click();
    await enterPractice();await page.getByRole('button',{name:'输入',exact:true}).waitFor();await page.getByRole('button',{name:'输入',exact:true}).click();
    const answer=language==='en'&&step===0?'I like milk and bread.':await page.evaluate(()=>languageTest.answer());
    if(language==='en'&&step===0){await page.screenshot({path:path.join(root,`tmp/language-npc-${width}.png`)});await page.getByRole('textbox',{name:'文字回答',exact:true}).fill('incorrect');await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('status').filter({hasText:'再听一遍示范'}).waitFor();}
    await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(answer);await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:step===3?'返回岛屿':'前往下一处',exact:true}).click();
    assert.equal((await page.evaluate(l=>languageTest.state(l),language)).courses[language+'-town-01'].scene.next,step+1);
   }
   assert.deepEqual((await page.evaluate(()=>languageTest.visits)).map(v=>v.kind),language==='en'?['npc','npc','landmark','npc','npc']:['npc','landmark','npc','npc']);
  }
  await page.evaluate(()=>{languageTest.travel('fire');languageTest.toggle(false);});assert.equal(await page.locator('.quest-tracker .quest-title').filter({hasText:'语言 ·'}).count(),0);
  await page.evaluate(()=>languageTest.toggle(true));await page.locator('.quest-tracker .quest-title').filter({hasText:'语言 ·'}).waitFor();
  await page.evaluate(()=>{languageTest.switch('en');languageTest.travel('fire');});
  for(let step=0;step<4;step++){
   await page.locator('.quest-tracker').getByRole('button',{name:'前往',exact:true}).click();await enterPractice();
   await page.getByRole('button',{name:'输入',exact:true}).click();await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(await page.evaluate(()=>languageTest.answer()));
   await page.getByRole('button',{name:'发送',exact:true}).click();
   if(step===3)await page.getByRole('status').filter({hasText:'没有看见火苗'}).waitFor();
   await page.getByRole('button',{name:step===3?'返回岛屿':'前往下一处',exact:true}).click();
  }
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).courses['en-fire-01'].scene.next,4);
  await page.evaluate(()=>{languageTest.switch('en');languageTest.travel('hanzi');});
  const tracker=page.locator('.quest-tracker');await tracker.getByRole('button',{name:'前往',exact:true}).waitFor();
  for(let step=0;step<4;step++){
   await tracker.getByRole('button',{name:'前往',exact:true}).click();
   if(step===3){assert.equal(await page.getByRole('button',{name:'输入',exact:true}).count(),0);assert.equal((await page.evaluate(()=>languageTest.current)).interaction.kind,'encounter');await page.evaluate(()=>languageTest.win());await tracker.getByRole('button',{name:'前往',exact:true}).click();}
   await enterPractice();await page.getByRole('button',{name:'输入',exact:true}).click();const answer=await page.evaluate(()=>languageTest.answer());await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(answer);await page.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'前往下一处',exact:true}).click();
  }
  await page.evaluate(()=>languageTest.switch('ja'));await page.evaluate(()=>languageTest.switch('en'));await tracker.getByRole('button',{name:'前往',exact:true}).waitFor();await tracker.getByRole('button',{name:'前往',exact:true}).click();
  await enterPractice();await page.locator('.camp-chat-progress').filter({hasText:'故事 5 / 6'}).waitFor();assert.equal((await page.evaluate(()=>languageTest.state('en'))).courses['en-hanzi-01'].scene.next,4);
  for(let step=4;step<6;step++){
   if(step===5){await tracker.getByRole('button',{name:'前往',exact:true}).click();await enterPractice();assert.equal((await page.evaluate(()=>languageTest.current)).interaction.name,'小灯');}
   await page.getByRole('button',{name:'输入',exact:true}).click();await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(await page.evaluate(()=>languageTest.answer()));await page.getByRole('button',{name:'发送',exact:true}).click();
   const next=page.getByRole('button',{name:step===5?'返回岛屿':'前往下一处',exact:true});await next.waitFor();
   if(step===5){await page.getByRole('status').filter({hasText:'原来朋友没有失约'}).waitFor();await page.screenshot({path:path.join(root,`tmp/hanzi-story-ending-${width}.png`)});}
   await next.click();
  }
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).courses['en-hanzi-01'].scene.next,6);
  for(const language of ['ja','ko']){
   const answer=await page.evaluate(l=>languageTest.card(l),language);await page.getByRole('button',{name:'输入',exact:true}).click();await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(answer);await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.word-practice'));
  }
  assert.equal(await page.evaluate(()=>languageTest.accepted),2);
  await page.evaluate(()=>languageTest.home());await page.getByRole('button',{name:'照顾宠物',exact:true}).click();await page.getByRole('textbox',{name:'输入回答'}).waitFor();
  await page.screenshot({path:path.join(root,`tmp/language-courses-${width}.png`)});
  const bounds=await page.locator('.language-practice-modal').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);
  await page.getByRole('textbox',{name:'输入回答'}).fill('Please use the chair.');await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state())).words.chair.practiceCount,1);
  await page.evaluate(()=>{languageTest.fail(true);languageTest.event();});await page.getByRole('status').filter({hasText:'测试保存失败'}).waitFor();
  await page.evaluate(()=>languageTest.fail(false));await page.getByRole('button',{name:'检查并保存练习'}).click();await page.getByRole('button',{name:'再玩一轮'}).waitFor();
  await page.evaluate(()=>languageTest.event());assert.equal((await page.evaluate(()=>languageTest.state())).words.chair.practiceCount,2);
  await page.evaluate(()=>languageTest.gate());await page.getByRole('button',{name:'再玩一轮'}).click();await page.evaluate(()=>languageTest.switch('ja'));await page.waitForFunction(()=>!document.querySelector('.language-practice-modal'));await page.evaluate(()=>languageTest.release());
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.chair.practiceCount,2);
  await page.evaluate(()=>languageTest.authoredHome());await page.getByRole('button',{name:'照顾宠物',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);
  assert.match(await page.locator('.dialogue-text').textContent(),/喝点水/);
  await page.screenshot({path:path.join(root,`tmp/home-authored-intro-${width}.png`)});
  await page.locator('.rpg-dialogue .close-button').click();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.water.practiceCount,1);
  await page.evaluate(()=>languageTest.authoredHome());await page.getByRole('button',{name:'照顾宠物',exact:true}).click();
  await page.getByRole('button',{name:'我来帮你',exact:true}).click();await page.getByRole('textbox',{name:'输入回答'}).fill('Water, please.');
  await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.water.practiceCount,1);
  await page.evaluate(()=>languageTest.event());await page.getByRole('button',{name:'再玩一轮'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.water.practiceCount,2);
  assert.match((await page.evaluate(()=>languageTest.state('en'))).words.water.lastPractice.source,/^home-story:/);
  await page.evaluate(()=>languageTest.event());assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.water.practiceCount,2);
  await page.evaluate(()=>languageTest.authoredObjectHome());await page.getByRole('button',{name:'找物游戏',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/book/);
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book,undefined);
  await page.getByRole('button',{name:'我来帮你',exact:true}).click();await page.getByRole('textbox',{name:'输入回答'}).fill('A book.');
  await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'wrong-book'}));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book,undefined);
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));await page.getByRole('button',{name:'选择其他游戏'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,1);
  await page.getByRole('button',{name:'选择其他游戏'}).click();await page.getByRole('button',{name:'一起布置',exact:true}).click();
  await page.getByRole('button',{name:'我来帮你',exact:true}).click();await page.getByRole('textbox',{name:'输入回答'}).fill('The book.');
  await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'book1'}));assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,1);
  await page.evaluate(()=>languageTest.homeEvent({kind:'move',objectId:'book1'}));await page.getByRole('button',{name:'再玩一轮'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,2);
  const pool=await page.evaluate(()=>languageTest.cardPool());assert.deepEqual(pool.cards.map(c=>c.entryId),['book']);
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,2);
  assert.deepEqual((await page.evaluate(()=>languageTest.cardPool('ja'))).cards,[]);
  await page.getByRole('button',{name:'选择其他游戏'}).click();await page.getByRole('button',{name:'找物游戏',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/lamp/);
  await page.getByRole('button',{name:'我来帮你',exact:true}).click();await page.getByRole('textbox',{name:'输入回答'}).fill('A lamp.');
  await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
  await page.evaluate(()=>languageTest.homeEvent({kind:'find',objectId:'lamp1'}));await page.getByRole('button',{name:'再玩一轮'}).waitFor();
  assert.deepEqual(new Set((await page.evaluate(()=>languageTest.cardPool())).cards.map(c=>c.entryId)),new Set(['book','lamp']));
  const lampAnswer=await page.evaluate(()=>languageTest.curriculumCard('lamp'));assert.equal(lampAnswer,'lamp');
  await page.getByRole('button',{name:'输入',exact:true}).click();await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(lampAnswer);
  await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.word-practice'));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.lamp.practiceCount,2);
  const cardAnswer=await page.evaluate(()=>languageTest.curriculumCard('book'));assert.equal(cardAnswer,'My book has magic.');
  await page.getByRole('button',{name:'输入',exact:true}).click();await page.getByRole('textbox',{name:'文字回答',exact:true}).fill(cardAnswer);
  await page.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.word-practice'));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,3);
  await page.evaluate(()=>languageTest.authoredTurnHome());await page.getByRole('button',{name:'轮流小游戏',exact:true}).click();
  await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/read/);
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.read,undefined);
  for(let turn=0;turn<2;turn++){
   await page.getByRole('button',{name:'我来帮你',exact:true}).click();
   await page.getByRole('textbox',{name:'输入回答'}).fill(turn===0?'Read, please.':'Please read.');
   await page.getByRole('button',{name:'回答',exact:true}).click();await page.getByRole('button',{name:'检查并保存练习'}).waitFor();
   await page.evaluate(()=>languageTest.homeEvent({kind:'pet-use',objectId:'book1',petId:'wrong-pet',activity:'read'}));
   assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.read?.practiceCount||0,turn);
   await page.evaluate(()=>languageTest.homeEvent({kind:'pet-use',objectId:'book1',petId:'pet1',activity:'read'}));
   await page.getByRole('button',{name:turn===0?'轮到你提出请求':'再玩一轮',exact:true}).waitFor();
   assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.read.practiceCount,turn+1);
   await page.evaluate(()=>languageTest.homeEvent({kind:'pet-use',objectId:'book1',petId:'pet1',activity:'read'}));
   assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.read.practiceCount,turn+1);
   if(turn===0){await page.getByRole('button',{name:'轮到你提出请求',exact:true}).click();await page.locator('.rpg-dialogue').waitFor();assert.match(await page.locator('.dialogue-text').textContent(),/小导演/);}
  }
  await page.evaluate(()=>languageTest.authoredWritingHome());await page.getByRole('button',{name:'写作品标签',exact:true}).click();
  await page.getByRole('button',{name:'我来帮你',exact:true}).click();await page.getByRole('button',{name:'给物品写标签',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'输入回答'}).count(),0);
  const receipt=await page.evaluate(()=>languageTest.labelTicket('book1'));assert.ok(receipt);
  await page.evaluate(()=>languageTest.homeEvent({kind:'label',objectId:'book1',text:'My book.',receipt:'stale'}));
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,1);
  await page.evaluate(receipt=>languageTest.homeEvent({kind:'label',objectId:'book1',text:'My cup.',receipt}),receipt);
  await page.getByRole('status').filter({hasText:'你的标签已保留'}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,1);
  await page.evaluate(receipt=>languageTest.homeEvent({kind:'label',objectId:'book1',text:'Our book.',receipt}),receipt);
  await page.getByRole('button',{name:'再玩一轮',exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,2);
  await page.evaluate(receipt=>languageTest.homeEvent({kind:'label',objectId:'book1',text:'Our book.',receipt}),receipt);
  assert.equal((await page.evaluate(()=>languageTest.state('en'))).words.book.practiceCount,2);
  assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
});
