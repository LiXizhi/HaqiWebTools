import {readFile,writeFile} from 'node:fs/promises';
import {parseXml,findAll} from './lib/xml_lite.mjs';
const source=new URL('../../../config/Aries/',import.meta.url);
const load=async path=>parseXml(await readFile(new URL(path,source),'utf8'));
const sets={},professions={};
for(const node of findAll(await load('ItemSet/AllItemSetAttr.xml'),'itemset')){
 sets[node.attr.id]=node.children.filter(row=>row.name==='stat_group').map(row=>({items:Number(row.attr.items),stats:Object.fromEntries(row.children.filter(stat=>stat.name==='stat').map(stat=>[stat.attr.type,Number(stat.attr.value)]))}));
}
for(const node of findAll(await load('Combat/DragonTotemStats.xml'),'profession')){
 professions[node.attr.gsid]=node.children.filter(row=>row.name==='stats').map(row=>({level:Number(row.attr.level),exp:Number(row.attr.exp),expId:Number(node.attr.exp_gsid),currentLevelExp:Number(row.attr.current_level_exp),stats:Object.fromEntries([...(row.attr.value||'').matchAll(/\((\d+),(\d+)\)/g)].map(match=>[match[1],Number(match[2])]))}));
}
const gifts=findAll(await load('VIP/MagicStar_gifts.xml'),'gift').map(node=>({itemId:Number(node.attr.gsid),weight:Number(node.attr.prob),exchangeId:Number(node.attr.exid)}));
const giftNames={17347:'翻倍捕鱼网',17348:'皇冠鱼专用网',17258:'白色魔力晶石',17369:'幸运铜币',17370:'幸运银币',17259:'黄色魔力晶石',17344:'精力值药剂(中)',17411:'幸运金币袋',17341:'乌晶石',12022:'魔法大喇叭'};
const giftItems=Object.fromEntries(gifts.map(({itemId})=>{
 if(!giftNames[itemId])throw Error('Unknown gift item '+itemId);
 return [itemId,{id:itemId,name:giftNames[itemId],kind:0,stats:{},description:'魔法口袋礼物，使用功能暂未开放。'}];
}));
if(!Object.keys(sets).length||!Object.keys(professions).length||!gifts.length)throw Error('Empty progression export');
await writeFile(new URL('../data/adventure/progression-bonuses.json',import.meta.url),JSON.stringify({source:'config/Aries: ItemSet/AllItemSetAttr.xml, Combat/DragonTotemStats.xml, VIP/MagicStar_gifts.xml',components:{},sets,professions,gifts,giftItems},null,2)+'\n');
console.log({sets:Object.keys(sets).length,professions:Object.keys(professions).length,gifts:gifts.length});