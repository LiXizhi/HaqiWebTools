import {SCHOOL_NAMES} from '../../adventure_core.js';
import {COLORS} from '../../adventure/renderer/primitives.js';
import {heroPortrait} from '../../hero_renderer.js';
import {localeChoices} from '../../locale.js';
import {tr,setText,fill} from '../../locale_runtime.js';
import {starterPicker,petPortrait} from './view_adventure_pets.js';
import {createEntryEmblem} from '../../ui/entry_brand.js';
import {createHeroPicker} from './view_hero_picker.js';
import {createSettingsControls} from './view_settings_controls.js';
import {el,button,schoolDescription,fitGameTitle} from './primitives.js';

// 第一行是母语按钮，第二行是第二语言下拉。母语不出现在下拉里。
export function renderEntryLocale(locale, secondLocale, onLocale, onSecond) {
    const chosen=localeChoices().some(row=>row.id===secondLocale&&row.id!==locale)?secondLocale:locale==='en'?'zh-CN':'en';
    const select=document.createElement('select');select.className='entry-second-locale';
    for(const row of localeChoices()){
        if(row.id===locale)continue;
        const option=new Option(row.name,row.id);option.lang=row.id;select.append(option);
    }
    select.value=chosen;select.setAttribute('aria-label',tr('第二语言'));
    select.onchange=()=>onSecond?.(select.value);
    const native=el('div','entry-locale',el('span','entry-locale-label','母语'),createSettingsControls({el,button}).localeSelector(locale,onLocale));
    const second=el('div','entry-locale',el('span','entry-locale-label','第二语言'),select);
    const note=el('p','entry-locale-note','上面的第二语言只用于新建角色；已有角色请在「旅途设置 → 语言」中修改。');
    return {root:el('div','entry-locale-stack',native,second,note),controls:[...native.querySelectorAll('button'),select]};
}
// 标题页左栏：大标题与语言选择。已有角色时登录留在右侧列表；没有离线角色时，右侧先选择登录或本地访客。
const ONLINE_GAME_LICENSE='文网文[2009]093号';
function isChineseSystem(){
    const languages=globalThis.navigator?.languages||[];
    return [...languages,globalThis.navigator?.language].some(language=>/^zh(?:-|$)/i.test(String(language||'')));
}
export function createEntryFooter(){
    return isChineseSystem()?el('footer','entry-license',ONLINE_GAME_LICENSE):null;
}
export function createEntryIntro({owner,login,cloud,locale,secondLocale,setLocale,setSecondLocale}={}) {
    const intro=el('div','entry-intro',createEntryEmblem(),el('p','eyebrow','魔法哈奇 · 第一章'),el('h1','game-title','魔法哈奇'),el('div','title-rule'),el('h2','chapter-title','初心之旅'),el('p','entry-description','带上抱抱龙，认识营地里的伙伴。\n帮它们解决麻烦，用你选择的语言交流，再一起挑战魔法对手。'),el('div','entry-tags',...['宠物相伴','结识朋友','双语冒险'].map(label=>el('span','badge',label))));
    if(new URLSearchParams(globalThis.location?.search||'').get('product')==='hanzi'){
        const en=locale==='en';intro.querySelector('.eyebrow').textContent=en?'HANZI MAGIC · CHAPTER ONE':'字源岛 · 第一章';intro.querySelector('.game-title').textContent=en?'Hanzi Magic':'字有魔法';intro.querySelector('.chapter-title').textContent=en?'Island of living words':'文字会醒来的地方';intro.querySelector('.entry-description').textContent=en?'Speak a character to awaken its magic. Write it to give it shape. Use recently practiced words as battle cards.':'说出汉字，唤醒力量。写出汉字，赋予形状。练习之后，在战斗中读写激活文字卡。';intro.querySelector('.entry-tags').replaceChildren(...(en?['Discover','Write & speak','Battle']:['探索字义','说字写字','文字战斗']).map(label=>el('span','badge',label)));
    }
    const controls=[];
    if(login||cloud){
        const cloudButton=button(owner?'我的云端旅途':'登录 Keepwork',login||cloud,'secondary cloud-entry-button');
        intro.append(cloudButton);controls.push(cloudButton);
    }
    if(setLocale&&locale){
        const picker=renderEntryLocale(locale,secondLocale,setLocale,setSecondLocale);
        intro.append(picker.root);controls.push(...picker.controls);
    }
    const title=intro.querySelector('.game-title');
    return {root:intro,controls,fit:()=>fitGameTitle(title)};
}
export function renderEntry(root,assets,stored,cb,error='') {
    const draft=cb.draft||{name:'',school:'fire',appearance:'boy',starter:'dragon_green',step:1};
    root.replaceChildren();root.className='entry-screen entry-wizard';
    const accountChoice=!!cb.accountChoice;
    const introPane=createEntryIntro({owner:cb.owner,login:accountChoice?null:cb.login,cloud:accountChoice?null:cb.cloud,locale:cb.locale,secondLocale:cb.secondLocale,setLocale:cb.setLocale,setSecondLocale:cb.setSecondLocale});
    const intro=introPane.root;
    const form=el('form','character-form creation-form');
    root.append(el('div','entry-layout',intro,form));
    const footer=createEntryFooter();if(footer)root.append(footer);
    introPane.fit();
    let paintVersion=0,previewVersion=0,composing=false,nameError=false;
    function operationFeedback(){
        form.setAttribute('aria-busy',String(!!cb.busy));
        if(cb.busy){const status=el('p','creation-caption');setText(status,cb.busy);status.setAttribute('role','status');form.append(status);}
        if(error){const status=el('p','error-text',error);status.setAttribute('role','alert');form.append(status);}
        if(cb.busy)for(const node of root.querySelectorAll('button,input,select'))node.disabled=true;
    }
    function paint(focus='') {
        const version=++paintVersion;composing=false;
        cb.stopPreview?.();form.replaceChildren();
        if(accountChoice&&draft.account!=='guest'){
            root.classList.remove('school-step','companion-step');
            const choices=el('div','entry-account-choices',
                button('登录 Keepwork',()=>cb.login?.(),'primary entry-account-choice'),
                el('p','entry-account-hint','登录后，角色与旅途进度可跨设备同步。'),
                button('本地访客',()=>{draft.account='guest';error='';paint('step');root.scrollTop=0;},'secondary entry-account-choice'),
                el('p','entry-account-hint','仅保存在此设备，不同步到云端。'));
            form.append(el('p','eyebrow','开启旅程'),el('h2','','选择进入方式'),el('p','creation-caption','你的魔法世界，正在等你。'),choices);
            operationFeedback();
            return;
        }
        root.classList.toggle('school-step',draft.step===3);root.classList.toggle('companion-step',draft.step===2);
        const steps=el('div','creation-steps');
        for(const [index,label]of ['起名字','选择抱抱龙','选择系别'].entries()){
            if(index)steps.append(el('i',''));
            // 序号与标签分开传入，让 tr() 只查标签本身，避免「01 起名字」整串无法命中词典。
            const item=el('span',draft.step===index+1?'current':draft.step>index+1?'done':'',`0${index+1} `,label);
            if(draft.step===index+1)item.setAttribute('aria-current','step');steps.append(item);
        }
        const titles=['你的冒险，从名字开始','选择你的抱抱龙','找到属于你的魔法'];
        const captions=[null,'选一位伙伴，陪你踏上魔法旅程。','点击系别，看看它的代表技能。喜欢的话，就选它吧。'];
        form.append(steps,el('h2','',titles[draft.step-1]));
        if(captions[draft.step-1]) form.append(el('p','creation-caption',captions[draft.step-1]));
        if(draft.step===1) {
            const preview=createHeroPicker(assets,draft);
            const name=el('input','name-input');name.id='hero-name';name.name='name';name.value=draft.name;name.maxLength=16;name.autocomplete='off';name.required=true;name.placeholder='';
            name.enterKeyHint='next';
            name.oncompositionstart=()=>{composing=true;};
            name.oncompositionend=()=>{composing=false;draft.name=name.value;};
            name.onkeydown=e=>{if(e.key==='Enter'&&(composing||e.isComposing||e.keyCode===229))e.preventDefault();};
            name.oninput=()=>{draft.name=name.value;nameError=false;name.removeAttribute('aria-invalid');name.removeAttribute('aria-describedby');form.querySelector('#hero-name-error')?.remove();};
            const label=el('label','field-label','你的名字');label.htmlFor=name.id;
            form.append(preview,label,name);
            if(nameError){
                const message=el('p','error-text','请输入你的冒险名字。');message.id='hero-name-error';message.setAttribute('role','alert');
                name.setAttribute('aria-invalid','true');name.setAttribute('aria-describedby',message.id);form.append(message);
            }
        } else if(draft.step===2) {
            const scene=el('div','companion-scene');
            const hero=el('div','companion-hero',heroPortrait(assets,draft,100,120),el('span','companion-name',draft.name));
            const companion=el('div','companion-position');
            const greeting=el('p','companion-greeting');greeting.setAttribute('role','status');
            scene.append(el('span','companion-scene-label','魔法营地 · 初次相遇'),el('div','companion-clearing'),hero,companion);
            const meet=(id,animate)=>{
                const pet=petPortrait(assets,id,0,82),runner=el('div',`companion-runner${animate?' arriving':''}`,pet);
                companion.replaceChildren(runner);
                setText(greeting,'{name}，以后就一起冒险吧。',{name:assets.content.pets[id].name});
                scene.setAttribute('aria-label',fill('{hero}和{pet}站在一起',{hero:draft.name,pet:assets.content.pets[id].name}).text);
            };
            const picker=starterPicker(assets,id=>{draft.starter=id;meet(id,true);},{el,button});
            for(const b of picker.children){const selected=b.dataset.petId===draft.starter;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
            meet(draft.starter,false);
            form.append(scene,greeting,el('p','companion-invitation','点一点，让喜欢的伙伴来到你身边。'),picker);
        } else {
            const schools=el('div','school-choices');
            for(const [key,label]of Object.entries(SCHOOL_NAMES)){
                const b=button([el('i','school-gem'),el('span','',label)],()=>{draft.school=key;draft.previewKey=null;paint(`[data-school="${key}"]`);},`school-choice ${draft.school===key?'selected':''}`);
                b.dataset.school=key;b.style.setProperty('--school',COLORS[key]);b.setAttribute('aria-pressed',String(draft.school===key));schools.append(b);
            }
            const canvas=el('canvas','creation-preview');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',fill('{school}系技能动画预览',{school:SCHOOL_NAMES[draft.school]}).text);
            const status=el('p','preview-status','正在准备技能演出…');status.setAttribute('role','status');
            const choices=cb.previewChoices(draft.school),cards=el('div','creation-skill-choices');
            if(!choices.some(c=>c.key===draft.previewKey))draft.previewKey=choices[0]?.key;
            let pause;
            const play=(key,automatic=false)=>{
                if(version!==paintVersion||!canvas.isConnected)return;
                const revision=++previewVersion,current=()=>version===paintVersion&&revision===previewVersion&&canvas.isConnected;
                draft.previewKey=key;
                for(const b of cards.children){const on=b.dataset.key===key;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}
                setText(pause,'暂停');
                if(!cb.busy)cb.preview(canvas,key,{appearance:draft.appearance,headId:draft.headId,bodyId:draft.bodyId,customHead:draft.customHead},text=>{if(current())setText(status,text);},automatic?()=>{
                    if(!current()||!choices.length)return;
                    const index=choices.findIndex(c=>c.key===key);play(choices[(index+1)%choices.length].key,true);
                }:undefined);
            };
            for(const choice of choices){
                const face=el('canvas','creation-skill-card');face.width=112;face.height=112;face.setAttribute('aria-hidden','true');
                const base=assets.effects.cards[choice.key]?.base;
                if(base)assets.skillArt.ensure(base).then(()=>{if(face.isConnected)assets.skillArt.drawSubject(face.getContext('2d'),base,0,0,112,112);}).catch(()=>{});
                const b=button([face,el('span','',choice.name)],()=>play(choice.key),'creation-skill-option');b.dataset.key=choice.key;cards.append(b);
            }
            pause=button('暂停',()=>{setText(pause,cb.pausePreview()?'继续播放':'暂停');},'text-button');
            form.append(schools,el('p','school-description',schoolDescription[draft.school]),canvas,
                el('div','preview-controls',status,button('重播',()=>play(draft.previewKey),'text-button'),pause),cards,
                el('p','creation-preview-note','代表技能演示，需在冒险中逐步学习。'));
            if(draft.previewKey)play(draft.previewKey,true);
        }
        const submit=el('button','primary begin-button');submit.type='submit';
        if(cb.busy)setText(submit,cb.busy);
        else if(draft.step===1)setText(submit,'下一步 · 选择抱抱龙');
        else if(draft.step===2)setText(submit,'下一步 · 选择系别');
        else setText(submit,'确认选择{school} · 开始冒险',{school:SCHOOL_NAMES[draft.school]});
        form.append(submit);
        if(draft.step===1){
            if(cb.playPrologue)form.append(button('播放开场动画',cb.playPrologue,'text-button entry-prologue-replay'));
            form.append(button('导入魔法哈奇角色',cb.importOriginal,'text-button creation-import'));
        }
        if(draft.step>1)form.append(button('上一步',()=>{draft.step--;paint('step');root.scrollTop=0;},'text-button creation-back'));
        else if(accountChoice)form.append(button('返回',()=>{draft.account=undefined;paint();form.querySelector('button')?.focus();root.scrollTop=0;},'text-button creation-back'));
        if(cb.roles)form.append(button('返回我的角色',cb.roles,'text-button creation-back'));
        operationFeedback();
        if(!cb.busy&&focus){
            const selector=focus==='step'?draft.step===1?'#hero-name':draft.step===2?'.starter-choices [aria-pressed="true"]':'.school-choices [aria-pressed="true"]':focus;
            form.querySelector(selector)?.focus();
        }
    }
    form.onsubmit=e=>{
        e.preventDefault();if(cb.busy||composing||e.isComposing||(accountChoice&&draft.account!=='guest'))return;
        if(draft.step===1){draft.name=draft.name.trim();if(!draft.name){nameError=true;paint('step');return;}}
        if(draft.step<3){draft.step++;paint('step');root.scrollTop=0;}
        else cb.create({name:draft.name.trim(),school:draft.school,appearance:draft.appearance,headId:draft.headId,bodyId:draft.bodyId,customHead:draft.customHead,starter:draft.starter});
    };
    paint();
}
