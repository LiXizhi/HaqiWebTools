// Isolated browser content QA. Uses in-memory fixture saves, never a user's role.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readIslandPacks} from './prepare_island_packs.mjs';
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const {chromium}=createRequire(import.meta.url)(option('--playwright',process.env.HAQI_PLAYWRIGHT_PACKAGE||'playwright'));
const base=option('--url','http://127.0.0.1:8799'),out=path.resolve(option('--output','tmp/island-expansion/review'));fs.mkdirSync(out,{recursive:true});
const buildings=JSON.parse(fs.readFileSync('data/adventure/building-art.json','utf8')),atlas=JSON.parse(fs.readFileSync('data/adventure/world-map-art.json','utf8'));
const media=[...readIslandPacks().map(p=>buildings.atlases[p.island.id]),atlas.resources.continuation];
const styles=[...fs.readFileSync('Haqi.html','utf8').matchAll(/href="(css\/[^"\s]+)"/g)].map(m=>m[1]);
const browser=await chromium.launch({headless:true,channel:option('--channel','msedge')}),report={browser:await browser.version(),media:[],scenes:[],errors:[]};
try{
 const mediaPage=await browser.newPage();await mediaPage.goto(base+'/tests/fixtures/island-performance.html?assets=local');
 for(const row of media){
  const response=await fetch(row.cdn,{headers:{Origin:base}});if(!response.ok)throw Error(row.cdn+' '+response.status);const bytes=Buffer.from(await response.arrayBuffer());
  const hash=createHash('sha256').update(bytes).digest('hex');if(hash!==row.sha256||bytes.length>200000)throw Error('CDN hash/size mismatch');
  const pixels=await mediaPage.evaluate(async url=>{const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const data=ctx.getImageData(0,0,image.width,image.height).data;let clear=0,solid=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)clear++;if(data[i]>240)solid++;}if(!clear||!solid)throw Error('Alpha missing');return {width:image.width,height:image.height,clear,solid};},row.cdn);
  report.media.push({url:row.cdn,bytes:bytes.length,sha256:hash,cors:response.headers.get('access-control-allow-origin'),...pixels});
 }
 await mediaPage.close();
 for(const pack of readIslandPacks())for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});page.on('pageerror',e=>report.errors.push(e.stack));
  await page.goto(base+'/tests/fixtures/island-performance.html?assets=local&zone='+pack.island.id);await page.waitForFunction(()=>window.islandQA,null,{timeout:120000});
  await page.evaluate(async()=>{const q=window.islandQA,tower=q.world.buildings.find(b=>b.frame==='tower');q.save.position={x:tower.x,y:tower.y+110};await q.assets.warmNearby(q.world,q.save);});await page.waitForTimeout(600);
  await page.screenshot({path:path.join(out,pack.island.id+'-landmark-'+width+'.png')});
  const dialogue=await page.evaluate(async ({zone,styles})=>{
   const [{renderDialogue},A,D,W]=await Promise.all([import('/js/view_adventure.js'),import('/js/adventure_core.js'),import('/js/adventure_dungeons_core.js'),import('/js/adventure_world_core.js')]);const q=window.islandQA,pack=q.assets.content.islandPacks.find(p=>p.island.id===zone);
   q.save.xp=q.assets.content.progression.xpThresholds[pack.island.recommendedLevel-1];A.syncProgression(q.save,q.assets.content);
   let loadedDungeons=0;for(const entry of pack.journeys){const dungeon=await q.assets.dungeons.load(entry.id);if(!dungeon.loaded||!dungeon.playable||dungeon.arenas.length!==(entry.kind==='tower'?entry.floors:entry.arenaCount))throw Error('Lazy dungeon installation failed');D.enterDungeon(q.save,q.assets.content,entry.id);const world=W.createWorld(entry.id,q.assets.content,q.save);if(!W.walkable(world,q.save.position.x,q.save.position.y))throw Error('Dungeon spawn blocked');D.leaveDungeon(q.save,q.assets.content);loadedDungeons++;}
   await Promise.all(styles.map(file=>new Promise(resolve=>{const css=document.createElement('link');css.rel='stylesheet';css.href='/'+file;css.onload=resolve;css.onerror=resolve;document.head.append(css);})));await Promise.all(pack.npcs.map(n=>q.assets.content.npcs[n.id].portrait?.id).filter(Boolean).map(id=>q.assets.ensureImage(id)));
   const root=document.createElement('div');document.body.append(root);let panel=null,index=0;
   const callbacks={close(){root.disposeDialogue?.();root.replaceChildren();},readDialogue:async()=>{},mapDialogue:()=>[],panel(id){panel=id;},track(){},chat(){}};
   const model={assets:q.assets,save:q.save};
   const quest=pack.quests[0],dialog={lines:quest.startDialog,index:0,preserveReply:true,finishLabel:'接取任务'};
   callbacks.next=()=>{if(index<dialog.lines.length-1){dialog.index=++index;renderDialogue(root,model,dialog,callbacks);}else A.applyAction(q.save,q.assets.content,{type:'accept-catalog',questId:quest.id,npcId:quest.startNpc});};
   renderDialogue(root,model,dialog,callbacks);while(index<dialog.lines.length-1)root.querySelector('button.primary').click();root.querySelector('button.primary').click();
   if(!q.save.quests[quest.id]?.accepted)throw Error('Quest button did not accept');
   const npc=pack.npcs.find(n=>n.worldObservation);renderDialogue(root,model,{npcId:npc.id},callbacks);const button=[...root.querySelectorAll('button')].find(b=>b.textContent===npc.worldObservation.label);if(!button)throw Error('Missing reality map action');button.click();if(panel!=='earthmap'||q.save.zone!==zone)throw Error('Reality map changed adventure state');
   const box=root.querySelector('.dialogue-box').getBoundingClientRect();return {questAccepted:true,realityMap:true,loadedDungeons,box:{x:box.x,y:box.y,w:box.width,h:box.height},screen:{w:innerWidth,h:innerHeight}};
  },{zone:pack.island.id,styles});
  if(dialogue.box.x<-.5||dialogue.box.x+dialogue.box.w>width+.5||dialogue.box.y<-.5||dialogue.box.y+dialogue.box.h>900+.5)throw Error('Dialogue outside viewport: '+pack.island.id+' '+width);
  await page.screenshot({path:path.join(out,pack.island.id+'-dialogue-'+width+'.png')});report.scenes.push({zone:pack.island.id,width,...dialogue});await page.close();
 }
 if(report.errors.length)throw Error(report.errors.join('\n'));
 console.log('Three islands: CDN hashes, alpha/CORS, six scene/dialogue layouts, quest acceptance and reality map callbacks passed.');
}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
