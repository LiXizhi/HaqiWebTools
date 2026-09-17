import {test,expect} from '@playwright/test';
import zlib from 'node:zlib';
// Deterministic stand-in for CDN art: every request under cdn.keepwork.com gets a solid PNG so the
// game is exercised offline. Map backgrounds are 1024x512 green (walkable land); everything else is 32x32.
const CRC=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return buf=>{let c=-1;for(const b of buf)c=t[(c^b)&255]^(c>>>8);return (c^-1)>>>0;};})();
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(CRC(body));return Buffer.concat([len,body,crc]);}
function png(width,height,[r,g,b,a=255]){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const row=Buffer.alloc(width*4+1);for(let x=0;x<width;x++)row.set([r,g,b,a],1+x*4);const raw=Buffer.concat(Array(height).fill(row));return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
const MAP=png(1024,512,[70,150,70]),ICON=png(32,32,[200,120,60]);
async function mockCDN(page){await page.route('https://cdn.keepwork.com/**',route=>route.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:/worldmaps\/[^,]*_bg[^,]*\.png/i.test(route.request().url())?MAP:ICON}));}
async function newCharacter(page,{name='测试哈奇',school='life'}={}){
  await page.goto('/Haqi.html');
  await expect(page.locator('#title-status')).toContainText('就绪',{timeout:60000});
  await page.locator('#create-name').fill(name);await page.locator(`[data-school=${school}]`).click();await page.locator('[data-gender=girl]').click();await page.locator('#create-start').click();
  await page.waitForFunction(()=>window.haqi?.game.screen==='world',null,{timeout:60000});
}
test('title → walk → captain → quest → fight → reward, offline with mocked CDN',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockCDN(page);
  await newCharacter(page,{school:'fire'});
  const start=await page.evaluate(()=>{const g=window.haqi.game;return {world:g.world.name,x:g.entities.player.x,y:g.entities.player.y,npcs:g.entities.npcs.length,mobs:g.entities.mobs.length,walk:g.collision.walkable(g.entities.player.x,g.entities.player.y)};});
  expect(start.world).toBe('61HaqiTown');expect(start.npcs).toBeGreaterThan(150);expect(start.mobs).toBeGreaterThan(20);expect(start.walk).toBe(true);
  await expect(page.locator('#status-name')).toHaveText('测试哈奇');await expect(page.locator('#tracker')).toContainText('Lv');
  // walk right with the keyboard
  await page.keyboard.down('d');await page.waitForTimeout(600);await page.keyboard.up('d');
  const moved=await page.evaluate(()=>window.haqi.game.entities.player.x);expect(moved).toBeGreaterThan(start.x+20);
  await page.screenshot({path:'test-results/haqi-town.png'});
  // a level-1 fight against the nearest town mob
  await page.evaluate(()=>{const g=window.haqi.game;const m=g.entities.mobs.find(m=>m.alive&&m.party[0].level<=2);g.entities.player.x=m.x+8;g.entities.player.y=m.y;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.waitForFunction(()=>window.haqi.game.screen==='battle',null,{timeout:10000});
  await expect(page.locator('#battle-hand .card').first()).toBeVisible();
  await expect(page.locator('#battle-hand .card img').first()).toHaveAttribute('src',/cdn\.keepwork\.com/);
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){
    const done=await page.evaluate(()=>!window.haqi.game.battle||window.haqi.game.battle.encounter.finished);
    if(done)break;
    const busy=await page.evaluate(()=>window.haqi.game.battle.scene.busy);if(busy){await page.waitForTimeout(250);continue;}
    const card=page.locator('#battle-hand .card:not([disabled])').first();
    if(await card.count()){await card.click();await page.waitForTimeout(150);
      // Single-target cards open target selection (tap an enemy); self/auto-target cards submit on click.
      await page.evaluate(()=>{const s=window.haqi.game.battle.scene;if(!s.pendingTargets)return;const enemy=s.pendingTargets.targets.find(t=>t.startsWith('1-'))??s.pendingTargets.targets[0];const p=s.layout.get(enemy);s.tap(p.x,p.y+40);});}
    else await page.evaluate(()=>window.haqi.game.battle.scene.pass());
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#battle-result')).toBeVisible({timeout:20000});
  await page.screenshot({path:'test-results/haqi-battle.png'});
  const outcome=await page.evaluate(()=>({winner:window.haqi.game.battle.encounter.result.winner,battles:window.haqi.game.profile.stats.battles}));
  expect(outcome.battles).toBe(1);
  await page.locator('#battle-continue').click();
  await page.waitForFunction(()=>window.haqi.game.screen==='world');
  if(outcome.winner===0){const after=await page.evaluate(()=>({exp:window.haqi.game.profile.exp,level:window.haqi.game.profile.level,kills:window.haqi.game.profile.stats.kills}));expect(after.kills).toBe(1);expect(after.exp+after.level).toBeGreaterThan(1);}
  // sail to the level 10+ island with a boosted character, accept a quest, defeat its target, turn it in
  await page.evaluate(()=>{const g=window.haqi.game;g.profile.level=11;g.profile.deck=[];const c=g.entities.npcs.find(n=>n.name==='法斯特船长');g.entities.player.x=c.x+20;g.entities.player.y=c.y+10;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('#dialog-buttons button',{hasText:'乘船'}).first().click();
  await page.waitForFunction(()=>window.haqi.game.world.name==='FlamingPhoenixIsland'&&window.haqi.game.screen==='world',null,{timeout:60000});
  await expect(page.locator('#world-name')).toHaveText('火鸟岛');
  await page.evaluate(()=>{const g=window.haqi.game;const c=g.entities.npcs.find(n=>n.id===30517);g.entities.player.x=c.x+20;g.entities.player.y=c.y+10;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.locator('#dialog-buttons button',{hasText:'安格斯的困惑'}).click();
  for(let i=0;i<4;i++){const b=page.locator('#dialog-buttons button').first();if(!(await page.locator('#dialog').isVisible()))break;await b.click();await page.waitForTimeout(120);}
  await expect(page.locator('#tracker')).toContainText('安格斯的困惑');
  const markers=await page.evaluate(()=>Object.fromEntries(window.haqi.game.markers));expect(markers[30517]).toBe('progress');
  // resolve the kill through the encounter API so the browser test does not depend on AI luck
  await page.evaluate(()=>{const g=window.haqi.game;const m=g.entities.mobs.find(m=>m.alive&&m.party.some(p=>p.template.endsWith('FireLand/MobTemplate_GhostOctopus.xml')));g.entities.player.x=m.x+8;g.entities.player.y=m.y;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.waitForFunction(()=>window.haqi.game.screen==='battle',null,{timeout:10000});
  await page.evaluate(()=>{const enc=window.haqi.game.battle.encounter;for(const u of enc.state.units)if(u.side===1)u.hp=1;});
  const deadline2=Date.now()+40000;
  while(Date.now()<deadline2){
    const done=await page.evaluate(()=>window.haqi.game.battle.encounter.finished);if(done)break;
    const busy=await page.evaluate(()=>window.haqi.game.battle.scene.busy);if(busy){await page.waitForTimeout(250);continue;}
    const attack=await page.evaluate(()=>{const s=window.haqi.game.battle.scene,enc=window.haqi.game.battle.encounter;const obs=enc.observation();const a=obs.legalActions.find(a=>a.kind==='cast'&&a.targetId.startsWith('1-')&&/Attack/.test(enc.ruleset.cards[a.card].type));if(!a)return false;s.submitAction(a);return true;});
    if(!attack)await page.evaluate(()=>window.haqi.game.battle.scene.pass());
    await page.waitForTimeout(400);
  }
  await expect(page.locator('#battle-result')).toContainText('胜利',{timeout:20000});
  await page.locator('#battle-continue').click();await page.waitForFunction(()=>window.haqi.game.screen==='world');
  await expect(page.locator('#tracker')).toContainText('1/1');
  await page.evaluate(()=>{const g=window.haqi.game;const c=g.entities.npcs.find(n=>n.id===30517);g.entities.player.x=c.x+20;g.entities.player.y=c.y+10;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.locator('#dialog-buttons button',{hasText:'安格斯的困惑'}).click();
  await page.locator('#dialog-buttons button').first().click();
  await page.waitForTimeout(300);
  const finished=await page.evaluate(()=>({done:window.haqi.game.profile.quests.finished[61076],beans:window.haqi.game.profile.inventory[17213],questsDone:window.haqi.game.profile.stats.questsDone}));
  expect(finished.done).toBe(1);expect(finished.questsDone).toBe(1);
  // save, reload, continue
  await page.evaluate(()=>window.haqi.persist());
  await page.reload();await expect(page.locator('#continue')).toBeVisible({timeout:60000});await expect(page.locator('#title-continue')).toContainText('测试哈奇');
  await page.locator('#continue').click();await page.waitForFunction(()=>window.haqi?.game.screen==='world',null,{timeout:60000});
  expect(await page.evaluate(()=>window.haqi.game.profile.stats.questsDone)).toBe(1);
  expect(errors).toEqual([]);
});
test('panels: shop buy, inventory, deck editor, journal, map and system; mobile layout',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockCDN(page);
  await newCharacter(page,{school:'fire'});
  await page.evaluate(()=>{const g=window.haqi.game;const n=g.entities.npcs.find(n=>g.data.shops[String(n.id)]?.some(r=>r.cost.length===1));const row=g.data.shops[String(n.id)].find(r=>r.cost.length===1);g.entities.player.x=n.x+20;g.entities.player.y=n.y+10;g.cooldown=0;g.profile.inventory[row.cost[0].gsid]=(g.profile.inventory[row.cost[0].gsid]??0)+row.cost[0].count;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.locator('#dialog-buttons button',{hasText:'看看商品'}).click();
  await expect(page.locator('#modal-title')).toContainText('商店');
  const buy=page.locator('#modal-body [data-buy]:not([disabled])').first();await expect(buy).toBeVisible();await buy.click();
  await expect(page.locator('#toasts')).toContainText('购买了');
  await page.locator('#modal-close').click();
  await page.keyboard.press('i');await expect(page.locator('#modal-title')).toContainText('背包');await expect(page.locator('#modal-body')).toContainText('奇豆');await page.locator('#modal-close').click();
  await page.keyboard.press('b');await expect(page.locator('#modal-title')).toContainText('卡组');
  const removeBtn=page.locator('#modal-body [data-remove]:not([disabled])').first();await removeBtn.click();
  await expect(page.locator('#modal-title')).toContainText('5/14');
  await page.locator('#deck-auto').click();await expect(page.locator('#modal-title')).toContainText('6/14');
  await page.locator('#modal-close').click();
  await page.keyboard.press('j');await expect(page.locator('#modal-title')).toContainText('任务日志');await page.locator('#modal-close').click();
  await page.keyboard.press('m');await expect(page.locator('#map-canvas')).toBeVisible();await page.locator('#modal-close').click();
  await page.locator('[data-menu=system]').click();await expect(page.locator('#modal-body')).toContainText('导出存档');await page.locator('#modal-close').click();
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/haqi-mobile.png'});
  // a battle hides the menu bar on small screens
  await page.evaluate(()=>{const g=window.haqi.game;const m=g.entities.mobs.find(m=>m.alive);g.entities.player.x=m.x+8;g.entities.player.y=m.y;g.cooldown=0;});
  await page.waitForTimeout(200);await page.keyboard.press('e');
  await page.waitForFunction(()=>window.haqi.game.screen==='battle',null,{timeout:10000});await page.waitForTimeout(600);
  await expect(page.locator('#menu-bar')).toBeHidden();
  await page.screenshot({path:'test-results/haqi-mobile-battle.png'});
  await page.locator('#battle-flee').click();await page.waitForFunction(()=>window.haqi.game.screen==='world');await expect(page.locator('#menu-bar')).toBeVisible();
  expect(errors).toEqual([]);
});
