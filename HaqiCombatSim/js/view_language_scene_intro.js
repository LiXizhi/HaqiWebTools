import {renderDialogue} from './view_adventure.js';

// Use the ordinary island dialogue, before mounting the language practice UI.
export function createLanguageSceneIntro(root,model,{step,actor,proceed,close}){
    let disposed=false;
    const dispose=()=>{if(disposed)return;disposed=true;root.disposeDialogue?.();root.replaceChildren();root.className='overlay';};
    const lines=step.intro.split('\n').map(text=>text.trim()).filter(Boolean).map(text=>({npcId:actor.id,speakerName:actor.name,text}));
    const dialog={npcId:actor.id,locationLabel:actor.locationLabel,lines,index:0,finishLabel:step.introReply||'我来试试'};
    // Story scaffolding is readable Chinese; target-language practice follows explicitly.
    const storyModel={...model,save:{...model.save,languageLearning:{...model.save.languageLearning,enabled:false}}};
    const paint=()=>renderDialogue(root,storyModel,dialog,
        {close:()=>{dispose();close();},next:()=>{if(disposed)return;if(dialog.index+1<lines.length){dialog.index++;paint();return;}dispose();proceed();}});
    paint();
    return {dispose};
}
