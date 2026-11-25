import {trainingPoints} from './adventure_learning_core.js';
import {mountDirectSale} from './adventure_mounts_core.js';
import {HANZI_NPCS} from './hanzi_island_scene_core.js';
import {LATER_ISLAND_NPCS} from './later_islands_scene_core.js';

const schools={fire:986,ice:987,storm:988,life:990,death:991};
// Accepted quests take priority over optional chat, even when not tracked.
export function npcHasActiveQuest(save,content,npcId) {
    const matches=id=>id!=null&&String(id)===String(npcId);
    return [...(content.quests||[]),...(content.catalogQuests?.quests||[])].some(quest=>{
        const state=save.quests?.[quest.id];
        if(!state?.accepted||state.claimed)return false;
        return matches(quest.startNpc)||matches(quest.endNpc)
            ||quest.goals?.some(goal=>goal.kind==='talk'&&matches(goal.id))
            ||quest.groups?.some(group=>group.kind==='talk'&&group.items.some(item=>matches(item.id)))
            ||quest.talks?.some(talk=>matches(talk.npcId));
    });
}
export function npcItemLimits(item) {
    if(item?.exchangeLimits)return item.exchangeLimits;
    const row=item?.sourceRecord,template=row?.[18];
    if(!template)return null;
    return {maxCount:template[31],expireTime:template[26],expireType:template[29],hourly:row[14],daily:row[15],weekly:row[16]};
}
export function installNpcCatalog(content,catalog) {
    const chapterNpcIds=new Set(Object.keys(content.npcs).map(Number));
    content.npcCatalog=catalog;
    for(const [id,item] of Object.entries(catalog.items)){
        const cur=content.items[id];
        if(!cur||(cur.kind===0&&cur.description==='任务奖励'&&!Object.keys(cur.stats||{}).length))content.items[id]=structuredClone(item);
    }
    for(const npc of catalog.npcs){
        npc.hidden??=npc.zone==='town'&&!chapterNpcIds.has(npc.id)&&!npcServices(content,npc).length;
        content.npcs[npc.id]??=structuredClone(npc);
        if(content.npcs[npc.id].zone===npc.zone)Object.assign(content.npcs[npc.id],{buttons:npc.buttons,instanceId:npc.instanceId,sex:npc.sex,age:npc.age});
    }
}
export function npcServices(content,npc) {
    const catalog=content.npcCatalog;
    if(!catalog)return [];
    const result=[];
    for(const button of npc.buttons||[]){
        const id=Number(button.param1||npc.id);
        if(button.dofunction?.includes('LearnSkill')&&catalog.mentors[id])result.push({kind:'mentor',id,label:button.label,gated:!!button.canshow});
        if(button.dofunction?.includes('NPCShopPage.ShowPage'))result.push({kind:'shop',id,menu:button.param2||'menu1',label:button.label,gated:!!button.canshow});
    }
    if(!result.some(r=>r.kind==='mentor')&&catalog.mentors[npc.id])result.push({kind:'mentor',id:npc.id,label:'学习魔法'});
    if(!result.some(r=>r.kind==='shop')&&catalog.shops.some(r=>r.npcId===npc.id))result.push({kind:'shop',id:npc.id,label:'查看商品',gated:false});
    return result;
}
// Only describe actions that this client can actually open.
export function npcPurpose(content,npc) {
    const id=Number(npc.id),services=npcServices(content,npc);
    if(id===36200)return {role:'巡逻搭档',title:'和我一起打退拦路怪',body:'我和你一起上！卡组先借给你，边打边试强化、陷阱和护盾。',action:'tactics',label:'和茜茜打怪 · 直接出战'};
    if(id===36203)return {role:'装备顾问',title:'让新装备真正派上用场',body:'查看装备与法杖，比较生命、伤害、抗性和附加卡牌。穿戴后会显示实际属性变化。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===36202)return {role:'战宠伙伴',title:'安排下一位出战伙伴',body:'查看已有战宠、出战阵容和喂养状态。不同伙伴与卡牌，适合承担不同的战斗职责。',panel:'pet',label:'查看战宠与出战阵容'};
    if(id===36205||npc.name==='法斯特船长')return {role:'旅行向导',title:'找到下一处冒险',body:'打开世界地图，查看可前往的岛屿与探索地点。',panel:'worldmap',label:'选择下一处目的地'};
    if(id===HANZI_NPCS.shibo)return {role:'字源刻碑人',title:'翻看汉字象形故事与笔顺',body:'打开中文字典，观看汉字象形故事动画、练习笔顺，并查看已找回的文字战斗卡。',panel:'dictionary',options:{language:'zh'},label:'打开汉字字典与故事动画'};
    if(id===HANZI_NPCS.xihe)return {role:'溪边农事官',title:'照料并编排岛上结识的战宠',body:'用字源岛获得的战宠口粮喂养并编排伙伴阵容，一起应对更强的守字野怪与守碑试炼。',panel:'pet',label:'查看战宠与出战阵容'};
    if(id===HANZI_NPCS.xiaodeng)return {role:'灯塔守夜人',title:'挑战字源守碑试炼',body:'查看字源岛专属三波战术试炼与各岛秘境。完整通关守碑试炼可获得 10 级本学派法杖与荣誉称号。',panel:'dungeons',label:'查看字源守碑试炼'};
    if(id===HANZI_NPCS.achu)return {role:'家书执笔人',title:'穿戴字源旅途获得的新装备',body:'打开角色与装备，比较新获得的圣徒装备与法杖属性，穿戴后直接增强下一次探索与试炼。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===LATER_ISLAND_NPCS.tide.alan)return {role:'灯塔守信人',title:'挑战潮汐秘境与 60 层回声塔',body:'查看「失声的潮灯」战术秘境与潮汐岛回声试炼塔。首通与登顶可获魔晶短裤与魔晶项链。',panel:'dungeons',label:'查看潮汐岛秘境与试炼塔'};
    if(id===LATER_ISLAND_NPCS.tide.cenbo)return {role:'老茶客',title:'整理高阶饰品与装备',body:'潮汐旅途中获得的魔晶戒指、项链与高阶装备，穿戴后即可直接对比生命与抗性提升。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===LATER_ISLAND_NPCS.tide.cenning)return {role:'远航旅人',title:'整备出战伙伴阵容',body:'高阶秘境与试炼塔允许携带多位伙伴共同出战，用旅途获得的口粮培养强力战宠。',panel:'pet',label:'查看战宠与出战阵容'};
    if(id===LATER_ISLAND_NPCS.float.lusheng)return {role:'海图测绘人',title:'挑战浮岸秘境与 80 层回声塔',body:'查看「两岸的旧测量台」三波战术秘境与浮岸岛回声试炼塔，赢取高阶魔晶装备与顽石项链。',panel:'dungeons',label:'查看浮岸岛秘境与试炼塔'};
    if(id===LATER_ISLAND_NPCS.float.mila)return {role:'旧账整理人',title:'比较并换上浮岸新装备',body:'检查浮岸岛任务赠予的传说权利法杖与饰品，强化并穿戴后再去迎战高阶守卫。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===LATER_ISLAND_NPCS.float.hezhou)return {role:'旧港引路人',title:'编排双人/多人伙伴阵容',body:'调整出战伙伴与坐骑，让治疗、护盾与输出各司其职。',panel:'pet',label:'查看战宠与出战阵容'};
    if(id===LATER_ISLAND_NPCS.sail.lifeng)return {role:'庆典筹备人',title:'挑战风帆档案室与百层试炼塔',body:'查看终章秘境「只准欢呼的档案室」与百层风帆回声塔，赢取终章大天使之翼与荣誉称号。',panel:'dungeons',label:'查看风帆岛秘境与试炼塔'};
    if(id===LATER_ISLAND_NPCS.sail.keeper)return {role:'名单守护者',title:'穿戴终章传说装备',body:'打开背包比较卓越魔晶法杖与高级短裤的属性增幅，迎接终章百层考验。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===LATER_ISLAND_NPCS.sail.xiaozhou)return {role:'归航舵手',title:'检查满编伙伴状态',body:'确认全队战宠的等级、生命与卡组配置，在试炼塔每 5/10 层机制首领前做好准备。',panel:'pet',label:'查看战宠与出战阵容'};
    if(services.some(row=>row.kind==='mentor'))return {role:'魔法导师',title:'为下一场战斗补充打法',body:'查看可学习的魔法与所需条件。先看卡牌效果，再决定用它来进攻、布置还是保护。',panel:'npc-services',label:'查看可学习的魔法'};
    if(services.some(row=>row.kind==='shop'&&!row.gated))return {role:'商店',title:'看看这里能补充什么',body:'查看商品、价格与购买条件，再按当前需要选择。',panel:'npc-services',label:'查看商品与价格'};
    if(id===30513)return {role:'火鸟岛向导',title:'先探 15 级金库风铃，再闯赤焰高塔',body:'15 级可先带战宠挑战三人秘境「金库失窃的风铃」赢取 30 格精良口袋，再攀登 30 层赤焰试炼塔；满 50 级后再集结四人迎战「篝火守夜人」。',panel:'dungeons',label:'查看火鸟岛秘境与试炼塔'};
    if(id===30601)return {role:'寒冰岛向导',title:'挑战冰封回信、风眼罗盘与霜晶塔',body:'28 级可先闯双人秘境「冰封的回信」赢精锐冠，35 级集结四人挑战「风暴中心的罗盘」赢本系艾希斯圣帽，或冲击 50 层霜晶试炼塔。',panel:'dungeons',label:'查看寒冰岛秘境与试炼塔'};
    if(id===30702)return {role:'沙漠岛向导',title:'挑战沙海回声、绿洲钥匙与流沙塔',body:'32 级可单骑挑战「沙海回声」，40 级带队闯「绿洲的最后一把钥匙」赢 50 格精良口袋，登顶 70 层流沙塔还可获传说权利法杖。',panel:'dungeons',label:'查看沙漠岛秘境与试炼塔'};
    if(id===35002)return {role:'幽暗岛向导',title:'挑战梦魇之约、沼泽航标与百层幽月塔',body:'40 级起可先推进幽暗岛「幽谷雾起」六章防线任务赢取宝石与祝福魔珠，55 级挑战双人秘境「梦魇尽头的约定」、四人秘境「沼泽中的航标」并冲击百层幽月试炼塔。',panel:'dungeons',label:'查看幽暗岛秘境与试炼塔'};
    if(id===35003)return {role:'前线观察者',title:'比较幽暗旅途收获的新装备与宝石',body:'整理战利品掉落的晶石与任务装备，穿戴并对比生命、抗性与攻击提升后再深入密林。',panel:'inventory',label:'比较并穿戴装备'};
    if(id===35006)return {role:'沼泽探路者',title:'编排抗压与集火战宠阵容',body:'面对法老王与深沼领主时，先确认出战战宠的生命、饱食度与破盾/治疗技能配置。',panel:'pet',label:'查看战宠与出战阵容'};
    if(id===35004||id===35005)return {role:'石脊哨兵',title:'查看幽暗前线秘境与试炼塔',body:'整备完毕后可由此直接查看幽暗岛精英秘境与百层幽月试炼塔进度。',panel:'dungeons',label:'查看幽暗岛秘境与试炼塔'};
    return null;
}
export function npcOffers(content,npc) {
    const catalog=content.npcCatalog;
    return npcServices(content,npc).flatMap(service=>service.kind==='shop'
        ?catalog.shops.filter(r=>r.npcId===service.id&&(!service.menu||r.menu===service.menu)).map(r=>({...r,kind:'shop',serviceLabel:service.label,gated:service.gated}))
        :catalog.mentors[service.id].courses.map((r,index)=>({...r,id:`mentor:${service.id}:${index}`,kind:'mentor',itemId:Number(r.gsid),serviceLabel:service.label,gated:service.gated,mentorClass:Number(r.class||catalog.mentors[service.id].attributes.class)})));
}
export function npcOfferStatus(save,content,offer,access={}) {
    const exchangeId=offer.kind==='mentor'?Number(offer.mentorClass===schools[save.school]?offer.exID:offer.other_exID):offer.exchangeId;
    const exchange=content.npcCatalog.exchanges[exchangeId];
    const price=exchange?.costs?.map(({id,count})=>`${count}${id===22000?'训练点':content.items[id]?.name||`物品${id}`}`).join('、');
    const status=checkNpcOffer(save,content,offer,access);
    return price?{...status,price}:status;
}
function checkNpcOffer(save,content,offer,access) {
    const deny=reason=>({allowed:false,reason});
    if(save.pendingEncounter)return deny('请先完成当前战斗');
    if(offer.gated)return deny('原版服务开放条件尚未接入');
    const item=content.items[offer.itemId], key=content.cardItems[offer.itemId];
    if(offer.kind==='mentor'&&save.cards[key])return deny('已学会');
    if(offer.type==='optionskill')return deny(offer.tips||'请前往指定导师学习');
    if(offer.kind==='shop'&&(offer.npcId<=0||offer.platform||offer.timeRange||offer.dailyLimit>=0))return deny('原服活动或限购条件尚未接入');
    const direct=mountDirectSale(content,offer);
    if(direct){
        if(direct.row.vip&&(access.keepworkVip!==true||!Number.isFinite(access.now)||Number.isFinite(Date.parse(access.expiresAt))&&Date.parse(access.expiresAt)<=access.now))return deny('该商品仅限有效会员购买');
        const limits=npcItemLimits(content.npcCatalog.items[offer.itemId]);
        if(limits&&(!Number.isSafeInteger(limits.maxCount)||limits.maxCount<=0))return deny('物品持有上限资料无效');
        if(limits&&(save.inventory[offer.itemId]||0)+1>limits.maxCount)return deny(`最多持有${limits.maxCount}件`);
        const price=`${direct.price.amount}${direct.price.currency===100?'奇豆':'魔豆'}`;
        const costs=[[direct.price.currency,direct.price.amount]];
        if((save.inventory[direct.price.currency]||0)<direct.price.amount)return {...deny(`需要${price}`),price,costs,reward:{gsid:offer.itemId,p:1000,cnt:1}};
        return {allowed:true,reason:price,price,costs,reward:{gsid:offer.itemId,p:1000,cnt:1}};
    }
    const own=offer.mentorClass===schools[save.school];
    const exchangeId=offer.kind==='mentor'?Number(own?offer.exID:offer.other_exID):offer.exchangeId;
    const exchange=content.npcCatalog.exchanges[exchangeId];
    if(!exchange)return deny(offer.kind==='mentor'?'此学系没有可用课程':'原服直购或兑换资料尚未接入');
    if(!Array.isArray(exchange.rewards)||exchange.rewards.length!==1)return deny('特殊兑换奖励尚未接入');
    const reward=exchange.rewards[0];
    if(reward.gsid!==offer.itemId||reward.p!==1000||!Number.isSafeInteger(reward.cnt)||reward.cnt<=0)return deny('特殊兑换奖励尚未接入');
    if(offer.kind==='mentor'){
        const lesson=content.cardLibrary?.find(r=>r.key===key);
        if(!lesson||!lesson.supported)return deny('技能效果尚未接入');
        if(reward.cnt!==1)return deny('特殊课程尚未接入');
        if(save.level<Number(offer.needlevel||1))return deny(`${offer.needlevel}级可学习`);
    }else if(!item||![1,3,18].includes(item.kind)||item.kind===18&&item.subtype!==2)return deny('商品已收录，此类原版交易尚未开放');
    else if(item.kind===18){
        const runeKey=content.cardItems[offer.itemId]||content.cardItems[offer.itemId-1000];
        const catchRune=content.runeCatalog?.runes.some(row=>row.gsid===offer.itemId&&row.key===runeKey&&Number.isFinite(row.baseWeight));
        if(!runeKey||!catchRune&&!content.cardLibrary?.some(r=>r.key===runeKey&&r.supported))return deny(runeKey?.includes('CatchPet')?'专属抓宠符文尚未配置':'符文效果尚未接入');
    }
    if(offer.kind==='shop'){
        const limits=npcItemLimits(content.npcCatalog.items[offer.itemId]);
        if(!limits)return deny('物品持有与有效期资料缺失');
        if(limits.expireTime||limits.expireType)return deny('限时物品有效期尚未接入');
        if(limits.hourly||limits.daily||limits.weekly)return deny('原服物品限购计数尚未接入');
        if(item.stats?.[180]&&(access.keepworkVip!==true||!Number.isFinite(access.now)||Number.isFinite(Date.parse(access.expiresAt))&&Date.parse(access.expiresAt)<=access.now))return deny('该商品仅限有效会员购买');
        if(!Number.isSafeInteger(limits.maxCount)||limits.maxCount<=0)return deny('物品持有上限资料无效');
        if((save.inventory[offer.itemId]||0)+reward.cnt>limits.maxCount)return deny(`最多持有${limits.maxCount}件`);
    }
    for(const condition of exchange.prerequisites){
        const {id,count}=condition;
        if(id===-14){if(save.level<count)return deny(`${count}级可用`);}
        else if(id===-18){if(schools[save.school]!==count)return deny('学系不符合条件');}
        else if(content.cardItems[id]&&count===1){if(!save.cards[content.cardItems[id]])return deny('需先学习前置技能');}
        else if(id>0&&id<50000&&[1,3].includes(content.items[id]?.kind)&&Number.isSafeInteger(count)&&count>0){
            const limits=npcItemLimits(content.npcCatalog.items[id]);
            if(!limits||limits.expireTime||limits.expireType)return deny('前置物品有效期尚未接入');
            if((save.inventory[id]||0)<count)return deny(`需持有${count}件${content.items[id].name}`);
        }
        else return deny('特殊兑换条件尚未接入');
    }
    const costs=new Map();
    for(const {id,count} of exchange.costs){
        const material=content.items[id];
        if(!Number.isSafeInteger(count)||count<=0)return deny('兑换数量无效');
        if(id>=50000)return deny('原服计数条件尚未接入');
        if(![100,984,22000].includes(id)&&material?.kind!==3)return deny('原服货币或装备抵扣尚未接入');
        if(material?.kind===3){
            const limits=npcItemLimits(content.npcCatalog.items[id]);
            if(!limits||limits.expireTime||limits.expireType)return deny('兑换材料有效期尚未接入');
        }
        if(offer.kind==='mentor'&&id!==22000)return deny('特殊课程费用尚未接入');
        if(offer.kind==='shop'&&id===22000)return deny('特殊兑换费用尚未接入');
        costs.set(id,(costs.get(id)||0)+count);
    }
    const price=formatNpcCosts(content,[...costs]);
    for(const [id,count] of costs)if((id===22000?trainingPoints(save,content):save.inventory[id]||0)<count)return {...deny(`需要${price}`),price,costs:[...costs],reward,key};
    return {allowed:true,reason:price,price,costs:[...costs],reward,key};
}
export function formatNpcCosts(content,costs,times=1) {
    return (costs||[]).map(([id,count])=>`${count*times}${id===22000?'训练点':content.items[id]?.name||'货币'}`).join('、')||'免费';
}
// How many times this exchange can be repeated: the tighter of the wallet and the remaining hold cap.
export function npcPurchaseBounds(save,content,offer,access={}) {
    const status=npcOfferStatus(save,content,offer,access);
    if(!status.allowed||offer.kind!=='shop')return {...status,maxCount:status.allowed?1:0};
    const unit=status.reward.cnt;
    let max=Number.MAX_SAFE_INTEGER;
    for(const [id,count] of status.costs){
        const held=id===22000?trainingPoints(save,content):(save.inventory[id]||0);
        max=Math.min(max,Math.floor(held/count));
        max=Math.min(max,Math.floor(Number.MAX_SAFE_INTEGER/count));
    }
    const limits=npcItemLimits(content.npcCatalog.items[offer.itemId]);
    max=Math.min(max,Math.floor((limits.maxCount-(save.inventory[offer.itemId]||0))/unit));
    max=Math.min(max,Math.floor(Number.MAX_SAFE_INTEGER/unit));
    if(!Number.isSafeInteger(max)||max<1)max=1;
    return {...status,maxCount:max};
}
export function purchaseNpcOffer(save,content,action,access={}) {
    const npc=content.npcCatalog?.npcs.find(n=>n.instanceId===action.npcInstanceId&&n.zone===save.zone);
    if(!npc)throw Error('请前往这位居民所在的岛屿');
    const offer=npcOffers(content,npc).find(r=>r.id===action.offerId);
    if(!offer)throw Error('商品或课程不存在');
    const status=npcPurchaseBounds(save,content,offer,access);
    if(action.paidByTest)throw Error('语言课程仅发放限额奖励，请使用货币购买');
    if(!status.allowed)throw Error(status.reason);
    const count=action.count??1;
    if(!Number.isSafeInteger(count)||count<1||count>status.maxCount)throw Error('购买数量无效');
    for(const [id,unitCost] of status.costs){
        const total=unitCost*count;
        if(id===22000)save.trainingPointsSpent=(save.trainingPointsSpent||0)+total;
        else save.inventory[id]-=total;
    }
    if(offer.kind==='mentor')save.cards[status.key]=content.cardLibrary.find(r=>r.key===status.key).copies;
    else save.inventory[offer.itemId]=(save.inventory[offer.itemId]||0)+status.reward.cnt*count;
}
