import { defaultParams } from './combat_params_core.js';
import { statIdToEntry } from './combat_unit_core.js';
import { isSupportedType } from './combat_cards_core.js';
import { FOOD_ID,CAPTURE_ID,petParams } from './adventure_pets_core.js';
import { equipmentRequirements } from './adventure_item_rules_core.js';
// Pure merge used by the browser and tests, after validating the original chapter.
export function installExpansion(content,dataset,catalog,candidates,kidsCards,kidsCharms,cardNames={}){
 content.pets=structuredClone(catalog.pets);content.homeUrl='https://keepwork.com/api/raw/maisi/maisi/webgames/MagicHaqi/MagicHaqi.html';content.balanceParams=defaultParams('kids');content.shop=[];
 content.equipmentExportReport=[];
 const addCard=key=>{const card=kidsCards[key];if(!card||!isSupportedType(card.type))return false;const base=key.replace(/_(Binding|1000Accuracy)$/,'');const schoolName={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡'}[card.spellSchool]||'通用';dataset.cards[key]??={...card,name:cardNames[key]||cardNames[base]||`${schoolName}秘法（${card.pipcost}魔力）`};return true;};
 dataset.charms=kidsCharms;
 for(const item of Object.values(content.strengtheningCatalog||{})){
  content.items[item.id]??=structuredClone(item);
  for(const stat of [139,140,141]){const key=content.cardItems[item.stats[stat]];if(key)addCard(key);}
 }
 for(const pet of Object.values(content.pets)){
  for(const lesson of pet.lessons)if(!addCard(lesson.key))throw Error('宠物卡牌未支持 '+lesson.key);
  content.shop.push({id:'pet:'+pet.id,kind:'pet',petId:pet.id,name:pet.name,level:pet.unlockLevel,school:pet.school});
 }
 for(const item of Object.values(candidates)){
  const fixed=[139,140,141].filter(id=>item.stats[id]).map(id=>content.cardItems[item.stats[id]]);
  const requirements=equipmentRequirements(item);
  const validSchool=!requirements.school||Object.values(content.schools).includes(requirements.school);
  if(!validSchool||fixed.some(key=>!key||!kidsCards[key]||!isSupportedType(kidsCards[key].type))){content.equipmentExportReport.push({id:item.id,reason:validSchool?'附加卡未支持':'学系不适用'});continue;}
  item.unsupportedStats=Object.keys(item.stats).filter(id=>!statIdToEntry(id)&&![137,138,139,140,141,167,168,169,170,180].includes(Number(id)));
  if(!Object.keys(item.stats).some(id=>statIdToEntry(id)||[139,140,141,167,170].includes(Number(id)))){content.equipmentExportReport.push({id:item.id,reason:'无可生效属性'});continue;}
    if(!Object.keys(item.stats).some(id=>(statIdToEntry(id)&&![182,183].includes(Number(id)))||[139,140,141,167,170].includes(Number(id)))){content.equipmentExportReport.push({id:item.id,reason:'治疗装备商城资源待准备'});continue;}
  fixed.forEach(addCard);content.items[item.id]??=item;
  content.items[item.id].isInternalTest=item.isInternalTest===true;
  const vipOnly=item.vipOnly===true||item.stats[180]===1;content.items[item.id].vipOnly=vipOnly;
  content.shop.push({id:'gear:'+item.id,kind:'gear',vipOnly,isInternalTest:item.isInternalTest===true,itemId:item.id,name:item.name,level:requirements.level,slot:item.slot,school:Object.keys(content.schools).find(s=>content.schools[s]===requirements.school)||'all'});
 }
 for(const [id,name] of [[FOOD_ID,'宠物营养餐'],[CAPTURE_ID,'捕获晶球']]){content.items[id]={id,name,kind:0,stats:{}};content.shop.push({id:'supply:'+id,kind:'supply',itemId:id,name,level:1,retired:id===CAPTURE_ID});}
 const p=petParams(content);content.progression.levelCap=p.levelCap;
 // One extra band past the cap: the top level still needs a "next level" target so the experience bar
 // can show this level's own progress instead of a flat 100%. EXPArea.lua EXPArea.UpdateUI L86-94
 // draws cur_value/max_value of the current level, where max_value is nextlevelexp.
 while(content.progression.xpThresholds.length<=p.levelCap){const level=content.progression.xpThresholds.length;content.progression.xpThresholds.push(content.progression.xpThresholds.at(-1)+p.xpGrowth*level);}
 for(const school of Object.keys(content.learn)){
  const seen=new Set(content.learn[school].map(x=>x.key));
  for(const pet of Object.values(content.pets).filter(x=>x.school===school))for(const lesson of pet.lessons)if(!seen.has(lesson.key)){content.learn[school].push({...lesson});seen.add(lesson.key);}
 }
 // Full player catalogue: exclude internal turn/status commands, retain unsupported spells visibly.
 const internalTypes=new Set(['Pass','Dead','PickPet','HoT','DoT','Fizzle']);
 const existingLessons=new Map(Object.values(content.learn).flat().map(row=>[row.key,row]));
 content.cardLibrary=[];
 for(const card of Object.values(kidsCards)){
  if(internalTypes.has(card.type))continue;
  const base=card.key.replace(/_(Binding|1000Accuracy)$/,'');
  const schoolName={fire:'烈火',ice:'寒冰',storm:'风暴',life:'生命',death:'死亡',balance:'平衡'}[card.spellSchool];
  const name=cardNames[card.key]||cardNames[base]||dataset.cards[card.key]?.name||`${schoolName}法术（${card.pipcost}魔力）`;
  dataset.cards[card.key]??={...card,name};
  const lesson=existingLessons.get(card.key)||[...existingLessons.values()].find(row=>card.key.startsWith(row.key+'_'));
  content.cardLibrary.push({key:card.key,name,school:card.spellSchool,level:Math.max(1,Number(card.requireLevel||lesson?.level||1)),copies:3,supported:isSupportedType(card.type)});
 }
 content.pets.legacy_gululu={id:'legacy_gululu',sourceId:'legacy_gululu',name:content.pet.name,school:'life',traits:{elementalAttribute:'生命'},unlockLevel:1,lessons:content.learn.life.slice(0,7),legacy:true,art:structuredClone(content.pets.shanhaijing_xuangui_gugu.art)};
 return {content,dataset};
}
