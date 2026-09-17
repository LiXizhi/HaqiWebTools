// Modal panels: quest journal, inventory, deck editor, shop, system. Each returns nothing and
// mutates the profile through progression/quest helpers; callers refresh HUD afterwards.
import {esc} from '../../views/dom.js';
import {openModal,closeModal,iconImg,toast} from '../render/hud.js';
import {itemName,itemIcon,CURRENCY} from '../data.js';
import {knownCards,deckCapacity,maxCopies,validateDeck,unlockLevel,canAfford,pay,addItem,expToNext,defaultDeck} from '../progression.js';
import {activeQuests,goalProgress,abandonQuest,questAvailable} from '../quest/quests.js';
import {describeCard as cardDescription} from '../combat/card-text.js';
import {SCHOOL_NAMES,SCHOOL_COLORS} from '../../rules/formulas.js';
import {cardFacePath,assetURL} from '../assets/cdn.js';
import {exportProfile} from '../save.js';
const $=s=>document.querySelector(s);
export function showJournal(profile,data,{onChange}) {
  const active=activeQuests(profile,data);
  const upcoming=data.quests.filter(q=>questAvailable(profile,q,data)).slice(0,8);
  const finished=Object.keys(profile.quests.finished).length;
  openModal(`任务日志 · 进行中 ${active.length} · 已完成 ${finished}`,`<div class="quest-list">${active.length?active.map(q=>`<div class="quest-item"><h3>${esc(q.title)}</h3><p>${esc(q.detail)}</p>${goalProgress(profile,q,data).map(g=>`<div class="goal ${g.have>=g.need?'done':''}">${esc(g.label)}${g.place?` <small>(${esc(g.place)})</small>`:''} · ${g.have}/${g.need}</div>`).join('')}<p class="muted">交付给：${esc(npcLabel(data,q.endNPC))} · 奖励：${rewardText(q,data)}</p><button data-abandon="${q.id}" class="quiet">放弃任务</button></div>`).join(''):'<div class="empty muted">没有进行中的任务。留意 NPC 头顶的 ! 标记。</div>'}</div>${upcoming.length?`<div class="divider"></div><h3>可接取</h3><div class="quest-list">${upcoming.map(q=>`<div class="quest-item"><h3>${esc(q.title)} <span class="pill">Lv ${q.level?.min??0}+</span></h3><p>${esc(q.detail)}</p><p class="muted">找 ${esc(npcLabel(data,q.startNPC))} 接取</p></div>`).join('')}</div>`:''}`);
  $('#modal-body').querySelectorAll('[data-abandon]').forEach(b=>b.addEventListener('click',()=>{abandonQuest(profile,Number(b.dataset.abandon));onChange();showJournal(profile,data,{onChange});}));
}
export function npcLabel(data,npcId){for(const list of Object.values(data.npcs)){const n=list.find(x=>x.id===npcId);if(n)return n.name+(n.place?`（${n.place}）`:'');}return `NPC ${npcId}`;}
export function rewardText(quest,data){return quest.rewards.map(g=>g.items.map(i=>`${itemName(data,i.gsid)}×${i.count}`).join(g.choice>=0&&g.items.length>1?' / ':'，')).filter(Boolean).join('；')||'—';}
export function showInventory(profile,data) {
  const rows=Object.entries(profile.inventory).filter(([,n])=>n>0).sort((a,b)=>Number(a[0])-Number(b[0]));
  openModal(`背包 · ${rows.length} 种物品`,rows.length?`<div class="item-grid">${rows.map(([gsid,n])=>`<div class="item">${iconImg(itemIcon(data,gsid))}<div><div>${esc(itemName(data,gsid))}</div><small class="muted">×${n.toLocaleString()}${Number(gsid)>=70000?' · 任务物品':''}</small></div></div>`).join('')}</div>`:'<div class="empty muted">背包是空的。</div>');
}
export function showDeck(profile,data,{onChange}) {
  const ruleset=data.ruleset,known=knownCards(profile,ruleset),cap=deckCapacity(profile),copies=maxCopies(profile);
  const counts={};for(const k of profile.deck)counts[k]=(counts[k]??0)+1;
  const locked=Object.values(ruleset.cards).filter(c=>c.school===profile.school&&c.gsids?.length&&!known.includes(c)&&unlockLevel(c)>profile.level&&unlockLevel(c)<=50&&/^[A-Z][a-z]+_/.test(c.key)&&!/Rune|Pet|VIP|Binding|Power|_adv|_Adv|Mob|Boss|Dominance|low_level|Stance|Accuracy\d|_Green|_Blue|_Purple|_Orange|_Crazy|_gold|OutStanding/.test(c.key)).sort((a,b)=>unlockLevel(a)-unlockLevel(b)).slice(0,6);
  const face=c=>{const p=cardFacePath(c);const url=p?assetURL(p):null;return url?`<img src="${url}" alt="" style="width:28px;height:28px;border-radius:4px">`:'';};
  openModal(`卡组 · ${profile.deck.length}/${cap} 张 · 每张最多 ${copies}`,`<div class="deck-grid"><div><h3>已掌握（${SCHOOL_NAMES[profile.school]}系）</h3>${known.map(c=>`<div class="deck-card">${face(c)}<div style="flex:1"><div style="color:${SCHOOL_COLORS[c.school]}">${esc(c.name??c.key)} <small class="muted">${c.pipcost<0?'X':c.pipcost} 魔力</small></div><small class="muted">${esc(cardDescription(c,ruleset))}</small></div><span class="count">${counts[c.key]??0}</span><button data-add="${c.key}" ${(counts[c.key]??0)>=copies||profile.deck.length>=cap?'disabled':''}>+</button><button data-remove="${c.key}" ${(counts[c.key]??0)?'':'disabled'}>−</button></div>`).join('')}${locked.length?`<h3 style="margin-top:12px">即将解锁</h3>${locked.map(c=>`<div class="deck-card muted">${face(c)}<div style="flex:1">${esc(c.name??c.key)}</div><span class="pill">Lv ${unlockLevel(c)}</span></div>`).join('')}`:''}</div><div><h3>说明</h3><p>卡组容量随等级增长（每 4 级 +2，上限 40）；同名卡上限每 10 级 +1（上限 6）。手牌 7 张，牌库用尽后自动洗回。</p><p>解锁等级由卡牌层级推算（Level1 → 1 级，Level2 → 6 级……），原始服务端的学习表未包含在仓库中。</p><div class="row"><button id="deck-auto">一键配卡</button><button id="deck-clear" class="quiet">清空</button></div><p id="deck-status" class="muted"></p></div></div>`);
  const body=$('#modal-body');
  const refresh=()=>{onChange();showDeck(profile,data,{onChange});};
  body.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>{profile.deck.push(b.dataset.add);refresh();}));
  body.querySelectorAll('[data-remove]').forEach(b=>b.addEventListener('click',()=>{const i=profile.deck.indexOf(b.dataset.remove);if(i>=0)profile.deck.splice(i,1);refresh();}));
  body.querySelector('#deck-auto').addEventListener('click',()=>{profile.deck=defaultDeck(profile,ruleset);refresh();});
  body.querySelector('#deck-clear').addEventListener('click',()=>{profile.deck=[];refresh();});
  const issue=validateDeck(profile,ruleset,profile.deck);body.querySelector('#deck-status').textContent=issue?`⚠ ${issue}（进入战斗时会自动配卡）`:'卡组有效。';
}
export function showShop(profile,data,npc,{onChange}) {
  const rows=data.shops[String(npc.id)]??[];
  const render=()=>{
    const menus=[...new Set(rows.map(r=>r.className||r.menu))];
    openModal(`${npc.name} 的商店`,`<p class="muted">${esc(npc.desc||'欢迎光临！')}</p>${menus.map(menu=>`<h3>${esc(menu)}</h3><div class="item-grid">${rows.filter(r=>(r.className||r.menu)===menu).map((r,i)=>{const item=data.ruleset.items[r.gsid];const cost=r.cost.length?r.cost.map(c=>`${itemName(data,c.gsid)}×${c.count}`).join(' + '):'价格未知';const affordable=r.cost.length&&canAfford(profile,r.cost);return `<div class="item">${iconImg(itemIcon(data,r.gsid))}<div style="flex:1"><div>${esc(item?.name??r.note??`物品 ${r.gsid}`)}</div><small class="cost">${esc(cost)}</small></div><button data-buy="${rows.indexOf(r)}" ${affordable?'':'disabled'}>购买</button></div>`;}).join('')}</div>`).join('')||'<div class="empty muted">这里没有出售的商品。</div>'}`);
    $('#modal-body').querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>{const r=rows[Number(b.dataset.buy)];try{pay(profile,r.cost);addItem(profile,r.gsid,1);toast(`购买了 ${itemName(data,r.gsid)}`);onChange();render();}catch(e){toast(e.message);}}));
  };
  render();
}
export function showSystem(profile,data,{onSave,onReset,onImport}) {
  openModal('系统',`<div class="stack"><div class="panel"><h3>${esc(profile.name)} · Lv ${profile.level} ${SCHOOL_NAMES[profile.school]}</h3><p class="muted">击败怪物 ${profile.stats.kills} · 战斗 ${profile.stats.battles} · 失败 ${profile.stats.defeats} · 完成任务 ${profile.stats.questsDone} · 游玩 ${Math.round(profile.stats.playtime/60)} 分钟 · 距升级 ${expToNext(profile.level)===Infinity?'满级':expToNext(profile.level)-profile.exp+' 经验'}</p><div class="row"><button id="sys-save" class="primary">保存</button><button id="sys-export">导出存档</button><label class="button">导入存档<input id="sys-import" type="file" accept="application/json" hidden></label><button id="sys-reset" class="quiet">删除角色</button></div></div><div class="panel"><h3>操作</h3><p>WASD / 方向键移动，E · 回车 · 空格 与 NPC 交谈，点击也可以走到目标。J 任务 · I 背包 · B 卡组 · M 地图 · Esc 关闭。手机：左下区域拖动摇杆，点击 NPC 或怪物。</p><p class="muted">走近怪物即进入回合制战斗。战斗使用与模拟器相同的确定性内核；数值以 kids 规则为准，实验性质，不代表原服完全一致。</p></div></div>`);
  $('#sys-save').addEventListener('click',()=>onSave());
  $('#sys-export').addEventListener('click',()=>exportProfile(profile));
  $('#sys-import').addEventListener('change',e=>onImport(e.target.files[0]));
  $('#sys-reset').addEventListener('click',()=>{if(confirm('删除当前角色并回到标题？此操作不可恢复。'))onReset();});
}
export {closeModal};
