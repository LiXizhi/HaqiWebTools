import {el,button} from './view_adventure.js';
import {bindChatMicrophone,createDialogueMicrophone} from './view_dialogue_microphone.js';
import {heroHeadPortrait} from './hero_renderer.js';
import {bossPortrait} from './view_adventure_dungeons.js';
import {LANGUAGE_REWARD_NAMES} from './adventure_dungeon_language_core.js';

export function createDungeonStoryView(root,cb){
    let screen,log,status,mic,next,read,progress,summary,activeBubble,portraitModel,loginNotice,loginButton,microphone;
    return {
        open({assets,save,dungeon,learning,sceneCanvas}){
            portraitModel={assets,save,dungeon};
            root.replaceChildren();root.className='overlay visible dungeon-story-overlay';
            screen=el('section',`dungeon-story-screen story-island-${dungeon.island}`);screen.setAttribute('role','dialog');screen.setAttribute('aria-modal','true');screen.setAttribute('aria-label',dungeon.name);screen.tabIndex=-1;
            const stage=el('div','dungeon-story-stage'),landmark=el('canvas','story-landmark');landmark.width=180;landmark.height=210;
            if(sceneCanvas?.width&&sceneCanvas?.height){
                const background=el('canvas','story-scene-snapshot');background.width=sceneCanvas.width;background.height=sceneCanvas.height;
                background.getContext('2d').drawImage(sceneCanvas,0,0);stage.append(background);
            }
            // Static scenery and portraits: no world renderer or animated background behind this screen.
            const paint=()=>{if(!landmark.isConnected)return;const c=landmark.getContext('2d');c.clearRect(0,0,180,210);assets.entranceArt?.draw(c,'shared',dungeon.kind==='tower'?'towerIntermediate':'elite',15,10,150,190);};
            stage.append(landmark);
            progress=el('span','');summary=el('span','');log=el('div','dungeon-story-log');log.setAttribute('role','log');log.setAttribute('aria-live','polite');
            status=el('p','dungeon-story-status');status.setAttribute('role','status');
            microphone=createDialogueMicrophone(button,{start:cb.start,finish:cb.finish,cancel:cb.cancel,isRecording:cb.isRecording});mic=microphone.node;mic.classList.add('story-microphone');
            loginNotice=el('section','camp-chat-login',el('h3','','登录 KeepWork，开启剧情配音'),el('p','','离线角色暂时无法使用语音功能。登录后会自动将当前本地角色转为云端角色，保留冒险进度。'));
            loginButton=button('登录并转为云端角色',()=>cb.login?.(),'primary');loginNotice.append(loginButton);loginNotice.hidden=true;
            next=button('继续',cb.next,'primary');read=button('朗读这句',cb.read,'secondary');
            const skip=button('跳过剧情',cb.skip,'secondary');skip.classList.add('dungeon-story-skip');
            screen.append(el('header','dungeon-story-heading',el('h2','',dungeon.name),progress,summary),stage,log,el('footer','dungeon-story-controls',loginNotice,el('div','story-buttons',read,mic,next),status),skip);
            root.append(screen);paint();void assets.entranceArt?.warm(['shared']).then(paint);screen.focus();
            screen.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cb.skip();}if(e.key==='Tab'){const controls=[...screen.querySelectorAll('button:not([hidden]):not(:disabled),[tabindex="0"]:not([aria-disabled="true"])')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
            summary.textContent=learning?'今日语言加成 · 本机时间次日 00:00 清零':'';
        },
        line(line,{target,translation,index,total,learning,loginRequired,rewardKey,percent}){
            if(activeBubble){activeBubble.disabled=true;activeBubble.tabIndex=-1;activeBubble.setAttribute('aria-disabled','true');}
            progress.textContent=`${index+1} / ${total}`;
            const bubble=el('article',`dungeon-story-bubble ${line.role}`);
            const player=line.role==='player',name=player?(portraitModel.save.name||'我'):line.speaker;
            const row=el('div',`story-message ${line.role}`),content=el('div','story-message-content');
            if(line.role!=='narrator'){const avatar=el('div','story-avatar',player?heroHeadPortrait(portraitModel.assets,portraitModel.save):bossPortrait(portraitModel.assets,portraitModel.dungeon));avatar.setAttribute('aria-label',name);row.append(avatar);}
            content.append(el('strong','story-speaker',name),bubble);row.append(content);
            bubble.append(el('p','story-script',target));
            if(translation&&translation!==target)bubble.append(el('p','story-translation',translation));
            if(learning&&line.role==='player'){
                bubble.append(el('small','story-line-reward',`本句配音奖励：${rewardKey?LANGUAGE_REWARD_NAMES[rewardKey]+' +'+percent+'%':'今日加成已满'} · 录音完成后自动继续`));
                activeBubble=bubble;bubble.tabIndex=0;bubble.setAttribute('role','button');bubble.setAttribute('aria-label','按住这句台词配音');
                bindChatMicrophone(bubble,{start:cb.start,finish:cb.finish,cancel:cb.cancel,isRecording:cb.isRecording});
                bubble.addEventListener('keydown',e=>{if(!bubble.disabled&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();void(cb.isRecording()?cb.finish():cb.start());}});
            }else activeBubble=null;
            log.append(row);while(log.children.length>4)log.firstElementChild.remove();log.scrollTop=log.scrollHeight;
            mic.hidden=!(learning&&line.role==='player');read.hidden=!learning;next.textContent=index===total-1?'开始探索':'继续';
        },
        update({message,phase,loginRequired,rewardKey,buffs}){
            loginNotice.hidden=!loginRequired;mic.hidden=loginRequired||!activeBubble;read.hidden=loginRequired||read.hidden;
            status.textContent=loginRequired?'登录后可配音，也可点击继续阅读剧情。':message||(phase==='waiting'?'按住对话，松开发送 · 点击录制，再点结束 · 滑出取消':'');
            mic.disabled=loginRequired||!['waiting','connecting','recording'].includes(phase);microphone.update({phase,disabled:mic.disabled});
            if(phase==='recording')status.textContent='正在录音 · 松开发送，滑出取消';
            if(activeBubble){activeBubble.disabled=mic.disabled;activeBubble.setAttribute('aria-disabled',String(mic.disabled));}
            const reward=activeBubble?.querySelector('.story-line-reward');
            if(reward&&phase==='awarded'&&!reward.dataset.received){reward.dataset.received='true';reward.textContent=`本句配音奖励：${LANGUAGE_REWARD_NAMES[rewardKey]} +1% · 已获得`;}
            if(reward&&phase==='capped')reward.textContent='今日语言加成已满，仍可继续练习';
            if(reward&&['expired','failed'].includes(phase)&&!reward.dataset.received)reward.textContent='本句未获得奖励';
            next.disabled=['connecting','recording','judging','speaking'].includes(phase);read.disabled=next.disabled;
            if(buffs)summary.textContent=Object.entries(buffs).filter(([,v])=>v>0).map(([k,v])=>`${LANGUAGE_REWARD_NAMES[k]} +${v}%`).join(' · ')+' · 本机时间次日 00:00 清零';
        },
        close(){root.replaceChildren();root.className='overlay';},
    };
}
