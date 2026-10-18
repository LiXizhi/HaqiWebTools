import {createRequire} from 'node:module';
import fs from 'node:fs';
const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(opt('--playwright','playwright'));
const url=opt('--url','http://127.0.0.1:8786'),out=opt('--out','tmp/home-performance');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:width===390?2:1});
 const page=await context.newPage(),errors=[],workers=[];page.on('pageerror',e=>errors.push(e.message));page.on('worker',w=>workers.push(w.url()));
 await page.goto(`${url}/tests/fixtures/home.html`);await page.waitForFunction(()=>window.homeQA?.ready);
 page.once('dialog',d=>d.accept('帧率测试'));await page.getByRole('button',{name:'新建家园',exact:true}).click();await page.locator('.home-canvas').waitFor();
 await page.waitForFunction(()=>Number(document.querySelector('.home-fps')?.textContent.split(' ')[1])>0);
 const samples=[];for(let i=0;i<5;i++){await page.waitForTimeout(1000);samples.push(await page.locator('.home-fps').textContent());}
 const moving=[];await page.mouse.move(width*.15,450);await page.mouse.down();
 for(let i=0;i<5;i++){await page.waitForTimeout(1000);moving.push(await page.locator('.home-fps').textContent());}await page.mouse.up();
 await page.screenshot({path:`${out}/home-terrain-${width}.png`});
 const result=await page.evaluate(async()=>{
  const {createHomeTerrainCache}=await import('/js/home_terrain_cache.js');
  const {paintHomeWorldTerrain}=await import('/js/view_home_art.js');
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');
  const cache=createHomeTerrainCache(),rect={x:-512,y:-512,w:500,h:500};c.translate(512,512);
  let missing=1,start=performance.now();while(missing&&performance.now()-start<15000){missing=cache.draw(c,73,rect,null,null,1);await new Promise(r=>setTimeout(r,20));}
  const stats=cache.stats();cache.dispose();
  const reference=document.createElement('canvas');reference.width=reference.height=512;const rc=reference.getContext('2d');rc.translate(512,512);paintHomeWorldTerrain(rc,73,{x:-514,y:-514,w:516,h:516});
  const a=c.getImageData(0,0,500,500).data,b=rc.getImageData(0,0,500,500).data;let delta=0;for(let i=0;i<a.length;i++)delta+=Math.abs(a[i]-b[i]);
  return {missing,stats,meanPixelDifference:delta/a.length};
 });
 console.log(JSON.stringify({width,samples,moving,workers,errors,...result}));if(errors.length||result.missing||result.stats.mode!=='worker'||result.meanPixelDifference>1)throw Error('terrain browser verification failed');await context.close();
}
}finally{await browser.close();}
