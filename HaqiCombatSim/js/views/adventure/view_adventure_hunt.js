import {HUNT_ID,HUNT_MARK,EQUIPMENT_ESSENCE,HUNT_EQUIPMENT,huntParams,huntStatus,duplicateSalvageQuotes,bulkSalvageQuote} from '../../adventure_hunt_core.js';
import {equipmentBaseAttributes,signedAttribute} from '../../adventure_equipment_core.js';
import {playerSpec} from '../../adventure_core.js';
import {specMaxHp} from '../../adventure_pets_core.js';
import {describeCard} from '../../card_description_core.js';
import {upgradeLevels} from '../../adventure_upgrade_core.js';
import {renderForgeCommission} from './view_forge_commission.js';
import {renderEconomyLedger} from './view_economy_ledger.js';
import {renderHuntInheritance} from './view_hunt_inheritance.js';
import {renderHuntEquipmentPreview} from './view_hunt_equipment_preview.js';
import {CAMPFIRE_RECIPE_BY_ID,campfireBuffDetail,canCookRecipe} from '../../campfire_cooking_core.js';

// Read-only presentation. Every inventory operation goes through the persisted action controller.
export function renderHuntForge(body,model,cb,{el,button,art}){
 const {save,assets}=model,c=assets.content,p=huntParams(c),selected=save.hunt?.selected??HUNT_EQUIPMENT[0];
 const marks=save.inventory[HUNT_MARK]||0,essence=save.inventory[EQUIPMENT_ESSENCE]||0,coins=save.inventory[100]||0;
 const root=el('div','hunt-forge'),hero=el('section','hunt-hero');
 renderForgeCommission(root,model,cb,{el,button});
 hero.append(el('p','hunt-eyebrow',`讨伐委托 · 固定${p.level}级挑战`),el('h2','','余烬守卫'),
  el('p','','“守卫借余烬蓄力时，用护盾或虚弱接住重击。等它喘息，就是我们的机会。”'),
  el('p','hunt-aid','本场援助：开局提供两张全系护盾卡，可施放给自己或一名伙伴。仅本场有效，不占用你的牌组。重击前使用，成功接招可获得反击强化。'),
  el('p','hunt-route','读懂预告 → 应对重击 → 抓住反击 → 积攒珍品'));
 const status=huntStatus(save,c),start=button('挑战余烬守卫',()=>cb.encounter(HUNT_ID),'primary hunt-start');
 start.disabled=!status.allowed;start.title=status.reason;
 const maxHp=specMaxHp(playerSpec(save,c)),hp=Math.max(0,Math.min(maxHp,Math.floor(save.heroHp??maxHp)));
 const readiness=el('div','hunt-readiness',el('strong','',`当前生命 ${hp} / ${maxHp}`));
 const hpBar=el('progress','hunt-health');hpBar.max=maxHp;hpBar.value=hp;
 hpBar.setAttribute('aria-label',`当前生命 ${hp}/${maxHp}`);readiness.append(hpBar,
  el('p','muted',hp<maxHp?'生命尚未恢复满。地图会自动恢复生命，也可以带上治疗卡再挑战。':'生命充足。出发前建议保留护盾和低耗攻击，准备接住重击。'));
 const meal=campfireBuffDetail(save.campfireBuff),tea=CAMPFIRE_RECIPE_BY_ID['herbal-dew-tea'];
 if(meal)readiness.append(el('p','hunt-meal-status',`料理：${meal.name} · 剩余 ${meal.remainingBattles} 场胜利。失败不消耗。`));
 else{
  const quote=canCookRecipe(save,tea);
  readiness.append(el('p','muted',quote.ok?`可准备轻露茶：${quote.usePantry?'消耗3份草药／野花':'消耗40奇豆补齐材料'}，连续3场胜利生效。`:'补给不足也能挑战。地图自动恢复生命，委托草圃每日提供免费草药。'));
 }
 const prepare=button(meal?'查看料理与补给':'去营火准备补给',()=>cb.panel?.('campfire-cooking'),'secondary');
 prepare.disabled=!!save.pendingEncounter;readiness.append(prepare);
 hero.append(readiness,start,el('p','muted',status.reason));root.append(hero);
 const wallet=el('section','hunt-wallet',el('strong','',`余烬猎印 ${marks} / ${p.exchangeCost}`),el('span','',`装备精华 ${essence}`),el('span','',`奇豆 ${coins}`));
 const progress=el('progress','hunt-progress');progress.max=p.exchangeCost;progress.value=Math.min(marks,p.exchangeCost);
 progress.setAttribute('aria-label',`猎印兑换进度 ${marks}/${p.exchangeCost}`);wallet.append(progress);
 wallet.append(el('p','',`每次胜利固定 +${p.marksPerWin} 猎印，并有 ${Math.round(p.directDropChance*100)}% 概率额外获得所选装备。${p.exchangeCost} 猎印可直接兑换；掉落不会清空猎印。`));
 const remaining=Math.max(0,Math.ceil((p.exchangeCost-marks)/p.marksPerWin));
 wallet.append(el('p','muted',remaining?`距下一次定向兑换最多还需 ${remaining} 次胜利。猎印不失效。`:'猎印已足够，可以直接兑换所选珍品。'));
 root.append(wallet,el('h3','','先选奖励，再出发'));
 const cards=el('div','hunt-gear-grid');
 for(const id of HUNT_EQUIPMENT){
  const item=c.items[id],card=el('section',`hunt-gear ${id===selected?'selected':''}`);
  if(item.art)card.append(art(assets,item.art,72,80));
  card.append(el('p','hunt-eyebrow',`珍品 · ${p.level}级通用 · 绑定`),el('h3','',item.name),el('p','',item.description.replace('讨伐珍品 · 绑定。','').replace(' 可用40枚余烬猎印定向兑换。','')));
  const stats=el('ul','hunt-gear-stats');
  for(const row of equipmentBaseAttributes(item))stats.append(el('li','',`${row.label} ${signedAttribute(row.value)}${row.unit}`));
  card.append(stats);
  for(const stat of [139,140,141]){
   const source=c.items[item.stats[stat]],spell=assets.dataset.cards[c.cardItems[item.stats[stat]]];
   if(spell)card.append(el('p','hunt-gear-spell',`附加卡 · ${source?.name||spell.name}：${describeCard(spell,{dataset:assets.dataset}).summary}`));
  }
  card.append(renderHuntEquipmentPreview(save,c,id,{el}),el('p','muted',`已拥有 ${save.inventory[id]||0} 件`));
  const choose=button(id===selected?'当前讨伐目标':'选择为掉落目标',()=>cb.action({type:'hunt-forge',op:'select',itemId:id}),'secondary');
  choose.disabled=id===selected||!!save.pendingEncounter;choose.setAttribute('aria-pressed',String(id===selected));
  const exchange=button(`${p.exchangeCost} 猎印兑换`,()=>cb.action({type:'hunt-forge',op:'exchange',itemId:id}),'primary');
  exchange.disabled=marks<p.exchangeCost||save.level<p.level||!!save.pendingEncounter;
  if(exchange.disabled)card.append(el('p','hunt-exchange-reason',save.pendingEncounter?'战斗结束后可兑换':save.level<p.level?`达到 ${p.level} 级后可兑换`:`还差 ${p.exchangeCost-marks} 枚猎印`));
  card.append(choose,exchange);
  if((save.inventory[id]||0)>0){
   const details=button(save.equipment[2]===id?'已穿戴 · 查看与强化':'查看属性对比与穿戴',()=>cb.panel?.('equipment',{itemId:id}),'secondary hunt-owned');
   details.disabled=!!save.pendingEncounter;card.append(details);
  }
  cards.append(card);
 }
 root.append(cards);
 const workshop=el('section','hunt-workshop',el('h3','','重复件也有用'),el('p','','每次讨伐胜利获得一件巡林备用帽。普通重复件回收得1精华，余烬珍品重复件得3精华；穿戴中、已强化、已开孔和最后一件受到保护。'));
 const duplicates=duplicateSalvageQuotes(save,c)
  .sort((a,b)=>Number(b.quote.allowed)-Number(a.quote.allowed));
 if(!duplicates.length)workshop.append(el('p','muted','保留第一件收藏。之后的重复备用帽和珍品，可在这里回收。'));
 const recycleList=el('details','hunt-recycle-list',el('summary','',`查看重复装备（${duplicates.length} 件）`));
 for(const [index,{row,quote}] of duplicates.slice(0,12).entries()){
  const line=el('div','hunt-recycle-row',el('span','',`${c.items[row.gsid].name} · 第${index+1}件`));
  const recycle=button(quote.allowed?`回收 +${quote.essence} 精华`:quote.reason,()=>cb.action({type:'hunt-forge',op:'salvage',guid:row.guid}),'secondary');
  recycle.disabled=!quote.allowed||!!save.pendingEncounter;line.append(recycle);recycleList.append(line);
 }
 if(duplicates.length>12)recycleList.append(el('p','muted','优先展示可回收的重复件，每次最多12件；处理后继续展示。受保护装备会保留。'));
 if(duplicates.length)workshop.append(recycleList);
 const bulk=bulkSalvageQuote(save,c);
 if(bulk.guids.length){
  const review=el('details','hunt-recycle-list',el('summary','',`核对批量回收（${bulk.guids.length} 件）`));
  for(const group of bulk.groups)review.append(el('p','',`${c.items[group.itemId].name} ×${group.count} → ${group.essence} 装备精华`));
  review.append(el('p','muted',`合计获得 ${bulk.essence} 装备精华。每种至少保留一件，穿戴、强化和开孔装备会保留。`));
  const confirm=button(`确认回收 ${bulk.guids.length} 件`,()=>cb.action({type:'hunt-forge',op:'salvage-bulk',guids:bulk.guids}),'secondary');
  confirm.disabled=!!save.pendingEncounter;review.append(confirm);workshop.append(review);
 }
 const recipes=el('div','hunt-recipes');
 const firstUpgrade=upgradeLevels(c,selected)[0];
 if(firstUpgrade)workshop.append(el('p','hunt-upgrade-hint',`余烬帽首次强化需要 ${firstUpgrade.cost[1]} ${c.items[firstUpgrade.cost[0]].name}。获得珍品后，可从上方装备详情进入强化。祝福魔珠供需要它的其他装备使用。`));
 for(const recipe of p.recipes){
  const block=el('section','hunt-recipe',el('strong','',`${c.items[recipe.itemId].name} ×${recipe.count}`),el('p','',`${recipe.essence} 装备精华 + ${recipe.coins} 奇豆`));
  const missing=[];
  if(essence<recipe.essence)missing.push(`${recipe.essence-essence} 装备精华`);
  if(coins<recipe.coins)missing.push(`${recipe.coins-coins} 奇豆`);
  block.append(el('p','muted hunt-recipe-status',missing.length?'还缺 '+missing.join('、'):'材料齐全，锻造后按上方数量扣除。'));
  if(!missing.length){
   const left=coins-recipe.coins;
   block.append(el('p','muted',`锻造后剩余 ${left} 奇豆。${left<tea.fallbackCoins?'轻露茶补料需40奇豆，也可用草药／野花制作。':'可按需留下40奇豆，作为下一份轻露茶的补料费。'}`));
  }
  const craft=button('确认锻造',()=>cb.action({type:'hunt-forge',op:'craft',recipeId:recipe.id}),'secondary');
  craft.disabled=missing.length>0||save.level<p.level||!!save.pendingEncounter;
  block.append(craft);recipes.append(block);
 }
 workshop.append(recipes,el('p','muted','锻造必定成功。讨伐失败不扣猎印；批量回收前请展开并核对清单。'));
 renderHuntInheritance(workshop,model,cb,{el,button});root.append(workshop);
 const ledger=el('details','hunt-ledger',el('summary','','最近的获得与消耗'));
 const entries=save.hunt?.ledger||[];
 if(!entries.length)ledger.append(el('p','muted','第一次讨伐胜利后，这里会记下猎印和装备的流向。'));
 for(const entry of [...entries].reverse())ledger.append(el('p','',({victory:'讨伐胜利',exchange:'定向兑换',salvage:'重复件回收',craft:'材料锻造',inherit:'强化继承'}[entry.kind])+ ' · '+entry.items.map(row=>`${c.items[row.itemId].name} ${row.count>0?'+':''}${row.count}`).join('，')));
 root.append(ledger);renderEconomyLedger(root,save,c,{el});body.append(root);
}
