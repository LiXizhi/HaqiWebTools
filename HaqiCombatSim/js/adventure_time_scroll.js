import {timeScrollParams,TIME_SCROLL_DEFAULT,validateTimeScrollReference,validateTimeScrollContent,resumeTimePosition,clampTimePosition,moveTimePosition,discoverTimeClue,completeTimeStory} from './adventure_time_scroll_core.js';
import {createTimeScrollView} from './view_adventure_time_scroll.js';
import {createStoryChat} from './language_story.js';
import {createLearningChatView} from './view_learning_chat.js';
import {createLearningVoice} from './language_adventure_voice.js';

const contentCache=new Map();
export async function loadTimeScroll(city,{signal,fetcher=fetch}={}){
    validateTimeScrollReference(city.timeScroll);const reference=city.timeScroll||TIME_SCROLL_DEFAULT;
    if(contentCache.has(reference))return contentCache.get(reference);
    const response=await fetcher(new URL(reference,new URL('../',import.meta.url)),{signal});
    if(!response.ok)throw Error('时光长卷暂时无法读取');
    const data=validateTimeScrollContent(await response.json());if(signal?.aborted)throw Error('已取消时光长卷加载');
    contentCache.set(reference,data);return data;
}
export function createTimeScroll({root,data,city,assets,getState,persist,award,onClose,viewFactory=createTimeScrollView,chatFactory=createStoryChat,voiceFactory=createLearningVoice,chatViewFactory=createLearningChatView,requestFrame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,isHidden=()=>document.hidden}){
    const start=getState(),role=start.role,owner=start.owner,zone=start.save.zone,returnPosition={...start.save.position},params=timeScrollParams(assets.content);
    let active=true,x=resumeTimePosition(start.save,city,data),target=x,direction=0,facing=2,pending=null,last=0,lastStored=0,frameId=0,chat=null,chatView=null;
    const valid=()=>{const now=getState();return active&&now.role===role&&now.owner===owner&&now.stage==='world'&&now.save.zone===zone&&!now.save.pendingEncounter;};
    const save=()=>getState().save;
    const view=viewFactory(root,{data,city,assets,getSave:save,onClose,onPractice:practice,onJump:next=>{if(!valid()||chat?.active)return;view.hideDetail();direction=0;pending=null;x=target=clampTimePosition(data,next);remember();},onDirection:value=>{direction=value;pending=null;target=x;},onTarget:(next,action=null)=>{if(!valid()||chat?.active)return;view.hideDetail();direction=0;target=clampTimePosition(data,next);pending=action;}});
    function remember(open=true){if(!valid())return;save().timeScrollRuntime={version:1,cityId:city.id,contentId:data.id,zone,x,active:open,returnPosition};try{persist(false);}catch(error){view.message(error.message);}}
    function commit(run){if(!valid())throw Error('时光探索场景已变化');const old=structuredClone(save());try{const result=run(save());if(save().revision!==old.revision)persist(true);return result;}catch(e){Object.assign(save(),old);for(const key of ['timeScrollProgress','languageAdventure'])if(!(key in old))delete save()[key];throw e;}}
    function interact(action){
        if(!valid())return;const station=data.stations[action.index];
        if(action.kind==='talk')view.reading(station);
        else try{commit(current=>discoverTimeClue(current,city.id,data,station.id,x,assets.content));view.reading(station,'clue');}catch(e){view.message(e.message);}
    }
    function practice(station){
        if(!valid())return;const settings=save().languageLearning;
        if(!settings?.enabled){view.message('先在城市的双语学习中选择目标语言，即可练习。现在仍可阅读和寻找线索。');return;}
        if(!['en','zh-CN'].includes(settings.target)){view.message('时光旅人目前支持中文与英语练习，可以继续阅读和探索。');return;}
        direction=0;target=x;pending=null;
        if(!chat){
            const voice=voiceFactory({getSettings:()=>save().languageLearning});
            // Read/type remain available to guests. SDK speech requires an online role.
            const guardedVoice={cancel:()=>voice.cancel(),finish:()=>voice.finish(),speak:(...args)=>{if(!getState().online)throw Error('登录并使用云端角色后可听示范；现在仍可文字练习。');return voice.speak(...args);},start:(...args)=>{if(!getState().online)throw Error('登录并使用云端角色后可录音；现在仍可文字练习。');return voice.start(...args);}};
            chat=chatFactory({practiceOnly:true,allowedZone:zone,voice:guardedVoice,
                viewFactory:callbacks=>{chatView=chatViewFactory(callbacks);return chatView;},
                getState:()=>({save:save(),content:assets.content,role:getState().role,identity:getState().owner,stage:valid()?'world':'battle'}),
                saveSettings:settings=>{if(valid()){Object.assign(save().languageLearning,settings);persist(true);}},
                onSpeech:event=>valid()?award(event):null,
                commit:completion=>commit(current=>completeTimeStory(current,data,completion)),
                onClosed:()=>{if(valid()){target=x;view.message('可以继续寻找线索，或走向另一站。');}},
                onFreeTalk:()=>chat.close()
            });
        }
        chat.open({id:station.story.id,name:station.traveler.name,role:'虚构时光旅人',stories:[station.story]},station.story,null,{greeted:true});
    }
    function tick(now){
        if(!valid()){onClose();return;}
        const dt=last?Math.max(0,(now-last)/1000):0;last=now;chat?.tick();
        if(!isHidden()&&!chat?.active&&!view.blocked){
            if(direction)target=clampTimePosition(data,x+direction*data.spacing);
            const next=moveTimePosition(data,x,target,dt,params.walkSpeed),moving=next!==x;if(moving)facing=next>x?2:1;x=next;
            if(pending&&Math.abs(x-target)<.1){const action=pending;pending=null;remember();interact(action);}
            view.draw(x,now/1000,moving,facing);
            if(moving&&now-lastStored>1000){lastStored=now;remember();}else if(!moving&&save().timeScrollRuntime?.x!==x)remember();
        }else if(!isHidden()&&!chat?.active)view.draw(x,now/1000,false,facing);
    }
    function frame(now){if(!active)return;tick(now);if(active)frameId=requestFrame(frame);}
    remember();frameId=requestFrame(frame);
    return {tick,suspend(){direction=0;target=x;pending=null;chat?.suspend();remember();},resume(){last=0;chat?.resume();},close(){if(!active)return;remember(false);active=false;cancelFrame(frameId);chat?.close();chatView?.root.remove();view.close();},get active(){return active;}};
}
