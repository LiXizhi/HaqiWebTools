import {trainingPoints} from './adventure_learning_core.js';

const schools={fire:986,ice:987,storm:988,life:990,death:991};
export function npcItemLimits(item) {
    if(item?.exchangeLimits)return item.exchangeLimits;
    const row=item?.sourceRecord,template=row?.[18];
    if(!template)return null;
    return {maxCount:template[31],expireTime:template[26],expireType:template[29],hourly:row[14],daily:row[15],weekly:row[16]};
}
export function installNpcCatalog(content,catalog) {
    const chapterNpcIds=new Set(Object.keys(content.npcs).map(Number));
    content.npcCatalog=catalog;
    for(const [id,item] of Object.entries(catalog.items))content.items[id]??=structuredClone(item);
    for(const npc of catalog.npcs){
        npc.hidden??=npc.zone==='town'&&!chapterNpcIds.has(npc.id)&&!npcServices(content,npc).length;
        content.npcs[npc.id]??=structuredClone(npc);
        if(content.npcs[npc.id].zone===npc.zone)Object.assign(content.npcs[npc.id],{buttons:npc.buttons,instanceId:npc.instanceId});
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
    const price=[...costs].map(([id,count])=>`${count}${id===22000?'训练点':content.items[id]?.name||'货币'}`).join('、')||'免费';
    for(const [id,count] of costs)if((id===22000?trainingPoints(save,content):save.inventory[id]||0)<count)return {...deny(`需要${price}`),price};
    return {allowed:true,reason:price,price,costs:[...costs],reward,key};
}
export function purchaseNpcOffer(save,content,action,access={}) {
    const npc=content.npcCatalog?.npcs.find(n=>n.instanceId===action.npcInstanceId&&n.zone===save.zone);
    if(!npc)throw Error('请前往这位居民所在的岛屿');
    const offer=npcOffers(content,npc).find(r=>r.id===action.offerId);
    if(!offer)throw Error('商品或课程不存在');
    const status=npcOfferStatus(save,content,offer,access);
    if(!status.allowed)throw Error(status.reason);
    for(const [id,count] of status.costs){
        if(id===22000)save.trainingPointsSpent=(save.trainingPointsSpent||0)+count;
        else save.inventory[id]-=count;
    }
    if(offer.kind==='mentor')save.cards[status.key]=content.cardLibrary.find(r=>r.key===status.key).copies;
    else save.inventory[offer.itemId]=(save.inventory[offer.itemId]||0)+status.reward.cnt;
}
