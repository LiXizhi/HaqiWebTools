// Build shared base effects plus thin variant references. No Lua execution or runtime build.
import fs from 'node:fs';
const root=new URL('../',import.meta.url),read=p=>JSON.parse(fs.readFileSync(new URL(p,root)));
const file=new URL('data/adventure/spell-effects.json',root),config=JSON.parse(fs.readFileSync(file));
const cards=read('data/kids/cards.json'),chapter=read('data/adventure/combat.json').cards,names=read('data/kids/card_names.json');
const trim=k=>k.replace(/(_(?:Blue|Green|Purple|gold|low_level))+$/gi,'').replace(/_Level0_\d+(?:_adv)?$/,'_Level0');
function baseKey(c){const stripped=trim(c.key);if(/_Level0$/.test(stripped))return stripped;return trim(cards[stripped]?.spellName||c.spellName||stripped);}
const recipes={};
function add(types,kind,extra={}){for(const t of types.split(' '))recipes[t]={kind,...extra};}
add('SingleAttack SingleAttackWithPercent SingleAttackWithMultipleDamage','bolt');
add('SingleAttackWithDOT DOTAttack DoT SingleAttackWithExplode SingleAttackWithImmolate','burst',{secondary:'dot'});
add('SingleAttackWithLifeTap SingleAttackWithLifeTapAndStandingWards','drain');
add('SingleAttackWithStun SingleAttackWithSelfStun','bolt',{secondary:'stun'});add('SingleAttackWithTrap SingleAttackWithStandingWards','bolt',{secondary:'capture'});
add('AreaAttack AreaAttackWithExtraThreat ArenaAttack','burst',{area:true});
add('AreaAttackWithDOT AreaDOTAttack AreaAttackWithImmolate','burst',{area:true,secondary:'dot'});
add('AreaAttackWithLifeTap','drain',{area:true});add('AreaAttackWithStun','lightning',{area:true,secondary:'stun'});
add('SingleHeal SingleHealWithHOT SingleHealWithCleanse SingleHealWithImmolate HoT DOTAttackWithHOT','heal',{friendly:true});
add('AreaHeal AreaHealWithHOT AreaHealWithAbsorb','heal',{area:true,friendly:true});
add('Charms','blade',{friendly:true});add('AreaCharm','blade',{area:true,friendly:true});
add('Wards StandingWards SymmetryWards','shield',{friendly:true});add('AreaWard','shield',{area:true,friendly:true});
add('Absorb SingleGuardianWithImmolate','absorb',{friendly:true});add('AreaAbsorb','absorb',{area:true,friendly:true});
add('ReflectionShield','reflect',{friendly:true});add('Global MiniAura Stance','aura',{friendly:true});
add('RemoveNegativeCharm AreaCleanse','cleanse',{friendly:true});recipes.AreaCleanse.area=true;
add('RemovePositiveCharm ConversePositiveWard','cleanse');add('StealCharm StealWard','steal');
add('SingleStun','stun');add('AreaStun','stun',{area:true});add('SingleFreeze','freeze');
add('SingleStealth','stealth',{friendly:true});add('Enrage','enrage',{friendly:true});
add('GainPips','pips',{friendly:true});add('AreaPowerPipBoost','pips',{area:true,friendly:true});
add('CatchPet','capture');add('PickPet','pet',{friendly:true});add('Fizzle Dead','dissolve');add('Pass','pass',{friendly:true});
const oldBases=config.bases||{},oldCards=config.cards;
const bases={};
for(const c of Object.values(cards)) {
 const id=baseKey(c);if(bases[id])continue;
 const recipe=recipes[c.type];if(!recipe)throw new Error('Missing explicit effect recipe: '+c.type);
 const schoolKind={ice:'swords',fire:'burst',storm:'lightning',life:'vines',death:'vortex',balance:'bolt'};
 const effect={...recipe,duration:['pass','dissolve'].includes(recipe.kind)?800:1800,count:64,scale:1.1,name:names[c.key]||c.key,source:c.datafile};
 if(recipe.kind==='bolt')effect.kind=schoolKind[c.spellSchool];
 if(/Trap|Weakness|Prism/i.test(c.key)&&['blade','shield'].includes(recipe.kind)){effect.kind='trap';effect.friendly=false;}
 bases[id]=oldBases[id]||effect;
}
// Preserve the hand-authored chapter choreography for every family, including low-level aliases.
if(config.version===1)for(const c of Object.values(chapter)) {const old=oldCards[c.key];if(old)bases[baseKey(c)]={...old,friendly:['heal','shield','blade'].includes(old.kind)};}
const fallbackNames={Pass:'跳过回合',Dead:'倒下消散',PickPet:'召唤宠物',HoT:'持续恢复',DoT:'持续伤害',Fizzle:'施法失败',Stance:'防御姿态'};
const refs={};
for(const c of Object.values(cards)) {
 const rank=/gold/i.test(c.key)?'gold':/Purple/i.test(c.key)?'purple':/Blue/i.test(c.key)?'blue':/Green/i.test(c.key)?'green':'normal';
 const family=baseKey(c);refs[c.key]={base:family,name:names[c.key]||chapter[c.key]?.name||fallbackNames[c.type]||bases[family].name,variant:{rank,level:Number(c.key.match(/_Level(\d+)/)?.[1]||0),lowLevel:/low_level/i.test(c.key)}};
}
config.version=2;config.description='本地kids全卡库演出：基础技能共享配置，等级/品质变体只引用基础并叠加光环。仅演出覆盖，不改变战斗引擎支持范围。';config.palettes.balance=['#d9c188','#fff4cc','#8c7453'];
config.variantAuras={normal:{color:null,rings:0},green:{color:'#93ee87',rings:1},blue:{color:'#80c9ff',rings:2},purple:{color:'#d09aff',rings:2},gold:{color:'#ffdb70',rings:3}};
config.bases=bases;config.cards=refs;fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log(`${Object.keys(bases).length} shared bases / ${Object.keys(refs).length} card references`);
