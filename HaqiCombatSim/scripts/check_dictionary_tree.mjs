import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.argv[2]||'playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:Number(process.argv[3])||1280,height:900}});
page.on('pageerror',e=>console.log('ERROR',e.message));
try{await page.goto('http://127.0.0.1:8797/Haqi.html');await page.waitForTimeout(12000);await page.getByRole('button',{name:'退出序章',exact:true}).click();await page.getByRole('button',{name:'本地访客',exact:true}).click();await page.locator('#hero-name').fill('语言树验收');await page.locator('form button[type=submit]').click();await page.locator('form button[type=submit]').click();await page.locator('form button[type=submit]').click();await page.getByRole('button',{name:'字典',exact:true}).click();
for(const language of ['zh','en']){
 if(language==='en'){const old=await page.locator('.dictionary-tree-host').elementHandle();await page.getByRole('button',{name:'英文 · Word',exact:true}).click();await old.waitForElementState('hidden');}
 await page.waitForFunction(()=>document.querySelector('.dictionary-tree-host')?.wordTree?.hits.length>0);await page.waitForTimeout(700);
 if(await page.locator('.dictionary-tree-host iframe').count())throw Error('Tree still uses iframe');
 if(await page.getByRole('button',{name:'语言树',exact:true}).count())throw Error('Extra tree tab remains');
 if(await page.locator('.dictionary-grid,.dictionary-toolbar').count())throw Error('Old grid remains');
 if(!(await page.locator('.dictionary-hero').isVisible()))throw Error('Learning progress missing');
 const hit=await page.evaluate(()=>document.querySelector('.dictionary-tree-host').wordTree.hits[0]);await page.locator('.dictionary-tree-host canvas').click({position:{x:hit.x,y:hit.y}});
 await page.keyboard.press('Escape');if(!await page.locator('.dictionary-tree-host dialog[open]').count())throw Error('Escape escaped mandatory popup');
 await page.getByRole('button',{name:'不认识',exact:true}).click();
 await page.locator('.dictionary-entry').waitFor();await page.screenshot({path:`tmp/tree-minimal/${language}-${process.argv[3]||1280}-learning-card.png`});
 await page.getByRole('button',{name:'关闭字典',exact:true}).click();await page.locator('.dictionary-tree-host canvas').waitFor();await page.waitForTimeout(1000);await page.screenshot({path:`tmp/tree-minimal/${language}-${process.argv[3]||1280}-dictionary-tree.png`});
}
await page.getByRole('button',{name:'战斗文字卡',exact:true}).click();if(await page.locator('.dictionary-tree-host canvas').count())throw Error('Tree not disposed');
console.log('Dictionary tab integration passed');}catch(error){await page.screenshot({path:'tmp/tree-minimal/dictionary-error.png'});console.log((await page.locator('body').innerText()).slice(0,2500));throw error;}finally{await browser.close();}
