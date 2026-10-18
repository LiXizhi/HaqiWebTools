import {createCloseButton} from './view_adventure_controls.js';
import {setText} from './locale_runtime.js';
import {petAppearanceStage} from './adventure_pets_core.js';
import {selectCompanionId} from './adventure_companion_core.js';

export function selectLoadingPet(save,content){
    const pets=save?.pets||{},ids=[save&&content?selectCompanionId(save,content):null,...(save?.formation||[]),...Object.keys(pets)];
    return ids.map(id=>pets[id]).find(pet=>pet&&content?.pets?.[pet.speciesId]?.art)||null;
}

export function createIslandSceneLoadingView({retry,exit}){
    const root=document.createElement('dialog');root.className='loading-card island-scene-loading';
    root.setAttribute('aria-label','正在准备场景');
    const heading=document.createElement('h2'),caption=document.createElement('p'),progress=document.createElement('progress'),again=document.createElement('button');
    setText(heading,'向冒险出发');caption.setAttribute('role','status');progress.setAttribute('aria-label','地形准备进度');
    const scene=document.createElement('div');scene.className='loading-pet-scene';scene.setAttribute('aria-hidden','true');
    for(const name of ['sun','cloud','hills','road']){const part=document.createElement('div');part.className='loading-pet-'+name;scene.append(part);}
    const runner=document.createElement('div');runner.className='loading-pet-runner';
    const shadow=document.createElement('span');shadow.className='loading-pet-shadow';
    const portrait=document.createElement('canvas');portrait.width=portrait.height=160;portrait.className='loading-pet-portrait';
    const dust=document.createElement('span');dust.className='loading-pet-dust';runner.append(shadow,dust,portrait);scene.append(runner);
    const note=document.createElement('p');note.className='loading-pet-note';setText(note,'小伙伴正在前方探路…');
    again.type='button';again.className='primary';setText(again,'重试');again.onclick=retry;
    root.append(createCloseButton(exit,'返回开始画面'),heading,scene,note,caption,progress,again);document.body.append(root);
    root.addEventListener('cancel',event=>{event.preventDefault();exit();});
    // Keep modal keyboard actions from becoming world shortcuts.
    root.addEventListener('keydown',event=>event.stopPropagation());root.addEventListener('keyup',event=>event.stopPropagation());
    let last='',portraitTicket=0,portraitScope=null,portraitRole=null;
    function paintPet(assets,save){
        const ticket=++portraitTicket,pet=selectLoadingPet(save,assets?.content),ctx=portrait.getContext('2d');
        ctx.clearRect(0,0,160,160);runner.hidden=false;setText(note,'小伙伴正在前方探路…');
        // Bake one small portrait. CSS animates its transform; no per-frame canvas work.
        const fallback=()=>assets?.tile?.(ctx,'creatures',6,0,0,160,160);
        if(!pet){fallback();return;}
        const speciesId=pet.speciesId,stage=petAppearanceStage(pet,assets.content);
        const draw=()=>assets.drawPet(ctx,speciesId,stage,0,0,160,160,0);
        const name=pet.name||assets.content.pets[pet.speciesId].name||'小伙伴';
        const label=()=>setText(note,'{name}正在前方探路…',{name});
        if(draw()){label();return;}
        // A cold atlas must not briefly impersonate a different owned pet.
        runner.hidden=true;setText(note,'{name}马上就来…',{name});
        // drawPet registers the existing atlas; use its shared load, never delay the gate.
        assets.ensureImage?.('pet:'+speciesId).then(()=>{
            if(ticket!==portraitTicket||!root.open)return;
            ctx.clearRect(0,0,160,160);if(draw()){runner.hidden=false;label();}
        }).catch(()=>{});
    }
    return {
        show(state,{assets,save,scope=save,roleId=null}={}){
            // Save snapshots can be replaced during login/rewards. Keep the first
            // chosen pet for this scene/role until the loading view closes.
            if(!root.open||portraitScope!==scope||portraitRole!==roleId){portraitScope=scope;portraitRole=roleId;paintPet(assets,save);}
            root.classList.toggle('is-paused',state.phase==='error');
            const key=JSON.stringify(state);if(key!==last){last=key;again.hidden=state.phase!=='error';progress.hidden=state.phase==='error';root.setAttribute('aria-busy',String(state.phase!=='error'));
                if(state.phase==='assets'){setText(caption,state.message||'正在准备场景资源…');progress.removeAttribute('value');}
                else if(state.phase==='error')setText(caption,state.message);
                else if(state.phase==='map'){setText(caption,state.message);progress.max=Math.max(1,state.total||6);if(Number.isFinite(state.done))progress.value=state.done;else progress.removeAttribute('value');}
                else{setText(caption,`正在准备地形 ${state.ready} / ${state.total}…`);progress.max=Math.max(1,state.total);progress.value=state.ready;}
            }
            if(!root.open)root.showModal();
        },
        hide(){portraitTicket++;portraitScope=null;portraitRole=null;if(root.open)root.close();last='';},
    };
}
