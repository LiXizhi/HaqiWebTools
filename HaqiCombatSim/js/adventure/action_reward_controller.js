import * as A from '../adventure_core.js';
import {el,createArtCanvas} from '../ui/dom.js';
import {equipmentSummary,previewEquipment} from '../adventure_equipment_core.js';
import {magicBeanExchangeQuote,exchangeMagicBeans} from '../adventure_magic_bean_exchange_core.js';
import {npcOffers} from '../adventure_npc_core.js';
import {ownedPetRecords} from '../adventure_pet_files_core.js';
import {rewardSnapshot,rewardChanges,firstCompanionReward,equipmentChangeLines} from '../adventure_reward_feedback_core.js';
import {createSaveCommitter} from '../adventure_reward_persistence.js';
import {rewardSound} from '../audio/game_sound_core.js';
import {fill} from '../locale_runtime.js';
import {openingJourney} from '../opening_journey_core.js';
import {createRewardFeedback} from '../views/adventure/view_adventure_rewards.js';
import {playOpeningPetWelcome} from '../views/adventure/view_opening_journey.js';

export function createActionRewardController({
    nodes,
    getContext,
    services,
    bus,
    persist=services?.persistence?.persist,
    queueCloudSave=services?.persistence?.queueCloudSave,
    commitReward=services?.persistence?.commitReward,
    close=services?.navigation?.close,
    openPanel=services?.navigation?.openPanel,
    paintHud=services?.navigation?.paintHud,
    paintPanel=services?.navigation?.paintPanel,
    loadPet,
    openDictionary,
    refreshWordGoals,
    setSelectedQuestId,
    setFirstWelcomePetId,
    paintFirstPetWelcome,
    toast=services?.feedback?.toast,
    safely=services?.feedback?.safely,
    membership,
    petScene,
    sceneFishing,
    islandSocial,
    languageAdventure,
    globalReward=services?.feedback?.globalReward,
    spellSound=services?.feedback?.spellSound,
    rewardChangesFn=rewardChanges,
    firstCompanionRewardFn=firstCompanionReward,
    rewardSoundFn=rewardSound,
    playOpeningPetWelcomeFn=playOpeningPetWelcome,
    queueMicrotaskFn=queueMicrotask,
}){
    const saveCommitter=commitReward?{commitReward}:createSaveCommitter({getContext,queueCloudSave,paintHud,paintPanel});
    let buyingVip=false;
    let exchangingBeans=false;

    const rewardRoot=nodes?.world?.parentElement?el('div','reward-feedback'):null;
    if(rewardRoot)nodes.world.parentElement.append(rewardRoot);

    const rewardFeedback=rewardRoot?createRewardFeedback(rewardRoot,{
        showBanner:false,
        onBurst:(event,now)=>{
            const {renderer,stage,save,assets}=getContext();
            if(!renderer||stage!=='world')return;
            const canvasRect=nodes.world.getBoundingClientRect(),from=renderer.worldToScreen(save.position);
            const bag=nodes.hud.querySelector('.game-nav [data-ui-icon="bag"]')?.closest('button');
            const xp=nodes.hud.querySelector('.hero-level-badge');
            const rows=[
                ...(event.xp?[{text:fill('经验 +{xp}',{xp:event.xp}).text,target:xp}]:[]),
                ...event.items.slice(0,3).map(item=>({text:fill(item.kind==='honor'?'解锁称号 · {name}':'{name} +{count}',{name:item.name,count:item.count}).text,item,target:bag})),
                ...(event.items.length>3?[{text:fill('另获 {count} 种奖励',{count:event.items.length-3}).text,target:bag}]:[]),
            ];
            rows.forEach(({text,target,item},index)=>{
                const rect=target?.getBoundingClientRect();if(!rect)return;
                const to={x:rect.x+rect.width/2-canvasRect.x,y:rect.y+rect.height/2-canvasRect.y};
                const art=item&&assets.content.items[item.id]?.art;
                const image=createArtCanvas(assets,art,48,48);
                renderer.interactionFeedback.floating.add({
                    image,
                    from:{x:from.x+(index-1)*20,y:from.y-65-index*22},
                    to,
                    text,
                    now:now+index*90,
                    onArrive:()=>{if(target.isConnected&&!matchMedia('(prefers-reduced-motion: reduce)').matches)target.animate([{scale:1},{scale:1.16},{scale:1}],{duration:240,easing:'ease-out'});},
                });
            });
            if(event.level)renderer.interactionFeedback.shake.trigger(now);
        },
        describe:reward=>{
            const {save,assets}=getContext();
            if(reward.kind==='honor')return {name:reward.name,label:'查看荣誉',hint:'已记入角色手册。'};
            if(reward.kind==='dictionary')return {name:reward.name,label:'翻开字典',reason:null};
            const item=assets.content.items[reward.id];
            const info={
                name:reward.kind==='card'?(assets.dataset.cards[reward.key]?.name||reward.name):reward.name,
                label:reward.kind==='card'?'立即配卡':reward.gear?'立即穿上':reward.kind==='pet'?'查看伙伴':'查看背包',
            };
            if(reward.gear){
                info.reason=A.equipmentBlockReason(save,item,assets.content);
                if(!info.reason){
                    const preview=previewEquipment(save,assets.content,{type:'equip',itemId:reward.id});
                    info.comparison=equipmentChangeLines(preview.rows.map(row=>({...row,value:row.before})),preview.rows);
                }
            }
            if(item?.art){
                const art=el('canvas');art.width=128;art.height=128;
                try{assets.draw(art.getContext('2d'),item.art,0,0,128,128);info.art=art;}catch{ /* Text remains usable when art fails. */ }
            }
            return info;
        },
        activate:reward=>{
            const {stage,panel,dialog}=getContext();
            if(stage!=='world'||panel||dialog)return false;
            if(reward.kind==='honor'){openPanel('equipment');return true;}
            if(reward.kind==='dictionary'){void openDictionary('zh',reward.id);return true;}
            if(reward.gear)return action({type:'equip',itemId:reward.id});
            openPanel(reward.kind==='card'?'deck':reward.kind==='pet'?'pet':'inventory');
        },
    }):{push(){},reset(){},hasPendingItems:false};

    function showRewards(before,actionType=''){
        const {save,assets,storageWarning,roleEpoch,stage,setPanel}=getContext();
        const event=rewardChangesFn(before,save,assets.content);
        queueCloudSave();
        for(const item of event.items)if(item.kind==='card')item.name=assets.dataset.cards[item.key]?.name||item.name;
        const openingPet=actionType==='opening-journey'&&event.items.some(item=>item.kind==='pet');
        const firstPet=!openingPet&&!storageWarning?firstCompanionRewardFn(before,save,event):null;
        const welcomePet=openingPet||!!firstPet;
        rewardFeedback.push(welcomePet?{...event,items:event.items.filter(item=>item.kind!=='pet')}:event);
        const lines=[
            ...(event.level?[['等级 {from} → {to}',{from:event.fromLevel,to:event.level}]]:[]),
            ...(event.xp?[['经验 +{xp}',{xp:event.xp}]]:[]),
            ...event.items.filter(item=>!welcomePet||item.kind!=='pet').map(item=>[item.kind==='honor'?'解锁称号 · {name}':'{name} +{count}',{name:item.name,count:item.count}]),
        ];
        if(openingPet)lines.unshift([save.formation?.includes(openingJourney(save)?.petId)?'咕噜噜已入队':'咕噜噜已放入宠物背包',{}]);
        if(!welcomePet&&stage!=='world')globalReward.show({title:openingPet?'搭档加入':'获得奖励',lines});
        if(!storageWarning&&!welcomePet){const cue=rewardSoundFn(event,actionType);if(cue)spellSound.play(cue);}
        if(firstPet){
            const epoch=roleEpoch,petId=firstPet.id;
            save.tips.pendingCompanionWelcome=petId;persist();queueCloudSave();
            queueMicrotaskFn(()=>{
                const current=getContext();
                if(epoch!==current.roleEpoch||current.stage!=='world'||!current.save.pets[petId])return;
                close({silent:true});setFirstWelcomePetId?.(petId);setPanel?.('first-pet-welcome');paintFirstPetWelcome();
                if(playOpeningPetWelcomeFn(nodes.overlay))spellSound.play('petJoin');
            });
        }
    }

    function missingRewardPets(quest){
        const {save,assets}=getContext();
        if(!quest)return [];
        const species=new Set(A.rewardsFor(save,assets.content,quest).filter(r=>r.kind==='pet').map(r=>r.petId));
        return Object.values(ownedPetRecords(save)).filter(p=>species.has(p.speciesId)&&!save.pets[p.id]).map(p=>p.id);
    }

    function action(value){
        const {save,assets,panel}=getContext();
        if(value.type==='feed'){
            const legacy=Object.values(ownedPetRecords(save)).find(p=>p.speciesId==='legacy_gululu');
            if(legacy&&!save.pets[legacy.id]){
                const current=save;
                return loadPet(legacy.id).then(()=>{if(getContext().save===current)return action(value);}).catch(e=>toast(e.message));
            }
        }
        if(value.type==='claim'){
            const ids=missingRewardPets(assets.content.quests.find(q=>q.id===value.questId));
            if(ids.length){
                const current=save;
                return Promise.all(ids.map(loadPet)).then(()=>{if(getContext().save===current)return action(value);}).catch(e=>toast(e.message));
            }
        }
        if(panel==='quests'&&(value?.type==='abandon-quest'||(value?.type==='track-catalog'&&value.remove)))setSelectedQuestId?.(Number(value.questId));
        const product=value.type==='buy'&&assets.content.shop.find(item=>item.id===value.productId);
        const resident=value.type==='npc-purchase'&&assets.content.npcCatalog?.npcs.find(npc=>npc.instanceId===value.npcInstanceId);
        const offer=resident&&npcOffers(assets.content,resident).find(row=>row.id===value.offerId);
        const memberOffer=offer&&assets.content.items[offer.itemId]?.stats?.[180];
        if(!product?.vipOnly&&!memberOffer&&value.type!=='magic-star-claim'&&!(value.type==='checkin'&&value.bonus===true))return performAction(value);
        return buyVipProduct(value);
    }

    async function buyVipProduct(value){
        if(buyingVip)return false;
        const {save:target,roleEpoch:epoch}=getContext();
        buyingVip=true;
        try{
            const status=await membership().refresh();
            const current=getContext();
            if(target!==current.save||epoch!==current.roleEpoch||current.stage!=='world')throw Error('角色或游戏状态已变化，请重新操作。');
            if(status.status==='guest')throw Error('请先登录会员账号，再使用会员权益。');
            return performAction(value,{keepworkVip:status.isVip,expiresAt:status.expiresAt,now:Date.now()});
        }catch(error){toast(error.message);return false;}finally{buyingVip=false;}
    }

    // Cosmetic preference only: written to this device's IndexedDB runtime record through
    // persist(), stripped by durableSave so it never reaches the cloud or marks progress dirty.
    function setMagicStarFollow(follow){
        const {save,stage}=getContext();
        if(!save||stage!=='world')return false;
        save.magicStarFollow=follow===true;
        persist();paintPanel();
        toast(save.magicStarFollow?'魔法星会继续跟随主角。':'已取消跟随，场景中不再显示魔法星。');
        return true;
    }

    // One click retires the camp deck or strengthening hand. The flag lives on the save so reopening the panel stays quiet.
    function seenGuide(key){
        const {save}=getContext();
        if(!save||(key!=='teachDeck'&&key!=='teachUpgrade')||save.tips[key])return;
        save.tips[key]=true;persist();
    }

    function setMountVisibility(hidden){
        const {save,stage}=getContext();
        if(!save||stage!=='world')return false;
        save.mountHidden=hidden===true;
        persist();paintHud();
        toast(save.mountHidden?'坐骑已在场景中隐藏，战斗时仍会出现。':'坐骑会跟随主角一起行动。');
        return true;
    }

    function performAction(value,access={}){
        return safely(()=>{
            const {save,assets}=getContext();
            if(value.type==='pet-feed'&&save.petInstanceVersion===1){petScene().feed(value.petId);paintPanel();return true;}
            if(value.type==='magic-star-follow')return setMagicStarFollow(value.follow!==false);
            if(value.type==='mount-visibility')return setMountVisibility(value.hidden===true);
            const sceneFeedback=value.type==='fish'&&sceneFishing()?.active;
            const equipmentBefore=['equip','unequip','ride','dismount','upgrade','mount-gem','remove-gems'].includes(value.type)?equipmentSummary(save,assets.content):null;
            const before=rewardSnapshot(save);
            const request=value.type==='checkin'?{...value,now:Date.now()}:value;
            let result;
            if(['forest-commission','camp-detour','opening-journey','buy','npc-purchase','checkin','speech-reward','magic-star-claim','choose-totem','use-totem-item','fish','stamina-potion'].includes(value.type)){
                const committed=saveCommitter.commitReward(request,access,{paint:'none',cloud:false});
                result=committed.result;
            }else{
                result=A.applyAction(save,assets.content,request,access);
                if(value.type==='accept-catalog'&&!bus?.emit('word-goals:refresh'))refreshWordGoals?.();
                persist();
                if(getContext().storageWarning)return false;
            }
            const nextSave=getContext().save;
            if(equipmentBefore){
                const changes=equipmentChangeLines(equipmentBefore,equipmentSummary(nextSave,assets.content));
                globalReward.show({title:'装备属性已更新',lines:changes.length?changes.slice(0,6).map(row=>['{label} {sign}{delta}{unit}',{...row,sign:row.delta>0?'+':''}]):[['主要属性没有变化，可在装备面板查看附加卡牌。',{}]]});
            }
            if(!sceneFeedback)showRewards(before,value.type);
            if(['claim','claim-catalog'].includes(value.type))islandSocial().activity('quest');
            queueCloudSave();paintHud();paintPanel();
            const text={checkin:'领取成功，奖励已放入背包！',unequip:'装备已卸下，属性与配卡已更新。',equip:'已经装备。属性将在下一场战斗中生效。',ride:'已经骑上坐骑。属性将在下一场战斗中生效。',dismount:'已经下来了。',upgrade:'装备强化成功！',hatch:'咕噜噜从蛋里探出了头，开始跟随你。',feed:'咕噜噜吃饱了，获得了经验！',deck:'卡包已保存。'};
            if(!sceneFeedback&&(value.type!=='opening-journey'||result?.message))toast(result?.message||text[value.type]||'进度已保存');
            if(value.type==='fish')languageAdventure().emit('fish','camp-coast',{caught:!!result?.caught,itemId:result?.items?.[0]?.id});
            else if(['equip','unequip','ride','dismount'].includes(value.type))languageAdventure().emit('equipment','equipment',{itemId:value.itemId});
            else if(['buy','npc-purchase','claim','claim-catalog'].includes(value.type))languageAdventure().emit('item-gained','inventory');
            return result?.message?result:true;
        });
    }

    function maybeExchangeMagicBeans({announce=true}={}){
        const {assets,save,roleStore,roleEpoch,panel,setSave,setStorageWarning}=getContext();
        if(exchangingBeans||!assets||!save||!roleStore?.owner||save.pendingEncounter)return;
        const member=membership().state;
        if(member.status!=='ready'||member.username!==roleStore.owner||member.isVip!==true)return;
        const now=Date.now(),record=roleStore.catalog.magicBeanExchange||null,owner=roleStore.owner,id=roleStore.catalog.activeId,epoch=roleEpoch;
        let quote;
        try{quote=magicBeanExchangeQuote(member,record,now);}catch(error){toast(error.message);return;}
        const current=getContext();
        if(!quote.beans||current.roleStore.owner!==owner||current.roleStore.catalog.activeId!==id||current.roleEpoch!==epoch)return;
        exchangingBeans=true;
        try{
            const before=rewardSnapshot(current.save),next=structuredClone(current.save);
            exchangeMagicBeans(next,assets.content,member,record,now);
            setSave(roleStore.commitMagicBeanExchange(next,quote.until));
            setStorageWarning(false);
            toast('会员剩余 {days} 天已兑换为 {beans} 魔豆',{days:quote.days,beans:quote.beans});
            if(announce)showRewards(before);
            paintHud();
            if(panel)paintPanel();
        }catch(error){toast(error.message);}finally{exchangingBeans=false;}
    }

    return {
        rewardRoot,
        rewardFeedback,
        showRewards,
        missingRewardPets,
        action,
        buyVipProduct,
        setMagicStarFollow,
        seenGuide,
        setMountVisibility,
        performAction,
        maybeExchangeMagicBeans,
    };
}
