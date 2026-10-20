import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html');await page.waitForFunction(()=>window.buildingDemo?.ready);
 await page.getByRole('button',{name:'建造',exact:true}).click();
 const snapshot=()=>page.evaluate(async()=>buildingDemo.store.snapshot('connected-building-demo'));
 const count=s=>Object.entries(s.parts).filter(([k])=>k.startsWith('chunk:')).reduce((n,[,p])=>n+Object.keys(p).length,0);
 for(const label of ['完整木屋模板','四角石堡模板']){
  const before=count(await snapshot());await page.getByRole('button',{name:label,exact:true}).click();
  await page.getByRole('textbox',{name:'召唤句子'}).fill(label==='完整木屋模板'?'I want a wooden house.':'I want a stone castle.');
  await page.getByRole('button',{name:'召唤',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.home-play')?.dataset.drawer==='build');
  for(let i=0;i<40&&count(await snapshot())===before;i++)await page.waitForTimeout(100);
  assert.ok(count(await snapshot())>before,label);
 }
 await page.screenshot({path:'tmp/home-building/templates.png'});
 const saved=count(await snapshot());await page.reload();await page.waitForFunction(()=>window.buildingDemo?.ready);assert.equal(count(await snapshot()),saved);
 // Capture the interior for visual inspection: its connected roof is absent,
 // while the roofs of other buildings remain visible.
 await page.goto('http://127.0.0.1:8792/HomeBuildingDemo.html?view=wood');await page.waitForFunction(()=>window.buildingDemo?.ready);await page.waitForTimeout(1500);
 await page.screenshot({path:'tmp/home-building/templates-interior.png'});
 assert.deepEqual(errors,[]);console.log({saved,errors});
}finally{await browser.close();}
