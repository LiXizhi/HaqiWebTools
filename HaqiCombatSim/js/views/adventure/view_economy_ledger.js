import {ECONOMY_SOURCE_LABELS,economyResourceName} from '../../adventure_economy_ledger_core.js';

export function renderEconomyLedger(root,save,content,{el}){
 const section=el('details','economy-ledger',el('summary','','资源账本 · 获得与消耗'));
 const ledger=save.economyLedger;
 section.append(el('p','muted','从本次版本开始累计；原有库存不算收入。首次奖励单独列出，便于判断日常收入。每次操作记录实际净变化。'));
 if(!ledger?.entries.length){section.append(el('p','','开始采集、制作或挑战后，这里会记下资源流向。'));root.append(section);return;}
 const coins=ledger.totals['100']||{gained:0,spent:0,firstGained:0};
 const stats=el('dl','economy-summary');
 for(const [label,value]of [['奇豆收入',coins.gained],['其中首次奖励',coins.firstGained],['可重复活动收入',coins.gained-coins.firstGained],['奇豆支出',coins.spent]])stats.append(el('div','',el('dt','',label),el('dd','',String(value))));
 section.append(stats,el('h4','','最近的资源变化'));
 const list=el('ol','economy-entries');
 for(const entry of [...ledger.entries].reverse().slice(0,12)){
  const line=el('li','',el('strong','',ECONOMY_SOURCE_LABELS[entry.source]+(entry.firstTime?' · 首次奖励':'')));
  line.append(el('p','',entry.changes.map(row=>`${economyResourceName(row.key,content)} ${row.delta>0?'+':''}${row.delta}`).join('，')));list.append(line);
 }
 section.append(list,el('p','muted',`累计记录 ${ledger.serial} 次资源变化，存档保留最近60次明细及长期收支汇总。`));root.append(section);
}
