import {HOME_COLOR_HEX,HOME_BIOMES,homeBiomeAt} from '../home_core.js';
import {tr} from '../locale_runtime.js';
import {DetailDialog} from '../ui/detail_dialog.js';

export const el=(tag,cls='',...children)=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 for(const child of children){
  if(child==null)continue;
  e.append(typeof child==='object'?child:tr(child));
 }
 return e;
};
export const button=(text,fn,cls='secondary')=>{const b=el('button',cls,text);b.type='button';b.onclick=fn;return b;};
export const activities={sleep:'睡觉',sit:'坐下休息',eat:'吃饭',drink:'喝水',bathe:'洗澡',swing:'荡秋千',slide:'玩滑梯',ball:'玩球',read:'读书',water:'浇花',dance:'跳舞',picnic:'野餐'};
export const COLOR_HEX=HOME_COLOR_HEX;
export const INTERACTIVE_BADGES={light:'可点亮',music:'可演奏',water:'流水互动',cook:'烹饪互动',screen:'屏幕互动'};
export const CATEGORY_PRIORITY={blocks:-1,garden:0,play:1,building:2,party:3,living:4,bedroom:5,kitchen:6,bathroom:7};
export const DEFAULT_SUMMON_TIP='读出或输入上方任意句子即可建造';

export function formatHomeTime(ms){
 if(!ms)return tr('暂无记录');
 const lang=typeof document!=='undefined'?document.documentElement.lang:'';
 try{return new Date(ms).toLocaleString(lang||undefined);}catch{return new Date(ms).toLocaleString();}
}

export function playSummonChime(getSummonAudioCtx,setSummonAudioCtx,quiet){
 if(quiet||document.hidden)return;
 const AudioCtx=globalThis.AudioContext||globalThis.webkitAudioContext;
 if(!AudioCtx)return;
 try{
  let summonAudioCtx=getSummonAudioCtx();
  if(!summonAudioCtx){summonAudioCtx=new AudioCtx();setSummonAudioCtx(summonAudioCtx);}
  if(summonAudioCtx.state==='suspended')void summonAudioCtx.resume().catch(()=>{});
  const now=summonAudioCtx.currentTime;
  [523.25,659.25,783.99,1046.5].forEach((freq,i)=>{
   const osc=summonAudioCtx.createOscillator(),gain=summonAudioCtx.createGain();
   osc.type=i===3?'triangle':'sine';
   const t=now+i*.075,dur=i===3?.28:.18;
   osc.frequency.setValueAtTime(freq,t);
   osc.frequency.exponentialRampToValueAtTime(freq*1.02,t+dur);
   gain.gain.setValueAtTime(.0001,t);
   gain.gain.exponentialRampToValueAtTime(.08,t+.015);
   gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
   osc.connect(gain);gain.connect(summonAudioCtx.destination);
   osc.start(t);osc.stop(t+dur+.02);
  });
 }catch{}
}

export function openHomeNameDialog({modal,model,cb,run,getActiveDialog,setActiveDialog,trigger,home:targetHome=null}={}){
 getActiveDialog()?.destroy();
 const isRename=!!targetHome;
 const dialog=new DetailDialog(modal,{el,title:tr(isRename?'重命名':'新建家园'),className:'equipment-item-dialog home-name-dialog'});
 setActiveDialog(dialog);
 dialog.dialog.addEventListener('close',()=>{if(getActiveDialog()===dialog)setActiveDialog(null);dialog.dialog.remove();});

 const banner=el('div','home-dialog-banner');
 const biomeBadges=el('div','home-dialog-biomes');
 for(const b of [HOME_BIOMES.meadow,HOME_BIOMES.blossom,HOME_BIOMES.mystic]){
  const badge=el('span','home-dialog-biome-pill',b.name);
  badge.style.setProperty('--biome-dot',b.grassA);
  biomeBadges.append(badge);
 }
 banner.append(
  biomeBadges,
  el('strong','home-dialog-lead','为伙伴创造一个家'),
  el('p','home-dialog-sub','说出一句话，召唤一件家具。拖动宠物，一起生活。')
 );

 const existing=new Set((model?.homes||[]).map(h=>h.name));
 const presetBiomes=Object.values(HOME_BIOMES);
 const heroDefault=model?.heroSave?.name?`${model.heroSave.name}${tr('的家园')}`:'';
 const defaultName=isRename
  ?targetHome.name
  :(heroDefault&&!existing.has(heroDefault)?heroDefault:tr((presetBiomes.find(b=>!existing.has(tr(b.name)))||presetBiomes[0]).name));

 const form=el('form','home-dialog-form');
 const label=el('label','home-dialog-label','新家园的名字');
 label.htmlFor='home-name-input';
 const nameInput=el('input','home-name-input');
 nameInput.id='home-name-input';
 nameInput.type='text';
 nameInput.maxLength=40;
 nameInput.autocomplete='off';
 nameInput.placeholder=tr('给家园起个名字，开始创造。');
 nameInput.value=defaultName;

 const presets=el('div','home-name-presets');
 const presetBtns=presetBiomes.map(b=>{
  const text=tr(b.name);
  const chip=button(b.name,()=>{
   nameInput.value=text;
   refreshState();
   nameInput.focus();
  },'home-name-chip');
  chip.style.setProperty('--biome-dot',b.grassA);
  presets.append(chip);
  return {chip,text};
 });

 const cancelBtn=button('取消',()=>dialog.close(),'secondary');
 const submitBtn=button(isRename?'重命名':'新建家园',()=>submit(),'primary');

 function refreshState(){
  const trimmed=nameInput.value.trim();
  submitBtn.disabled=!trimmed;
  for(const {chip,text} of presetBtns){
   const active=trimmed===text;
   chip.classList.toggle('is-active',active);
   chip.setAttribute('aria-pressed',String(active));
  }
 }
 function submit(){
  const trimmed=nameInput.value.trim().slice(0,40);
  if(!trimmed)return;
  dialog.close();
  if(isRename)run(()=>cb.rename(targetHome,trimmed));
  else run(()=>cb.create(trimmed));
 }
 nameInput.oninput=refreshState;
 form.onsubmit=e=>{e.preventDefault();submit();};
 form.append(label,nameInput,presets);
 dialog.body.append(banner,form);
 dialog.footer.append(cancelBtn,submitBtn);
 refreshState();
 dialog.open(trigger);
 nameInput.focus({preventScroll:true});
 nameInput.select();
}

export function openHomeRemoveDialog({modal,cb,run,getActiveDialog,setActiveDialog,targetHome,trigger}){
 if(!targetHome)return;
 getActiveDialog()?.destroy();
 const dialog=new DetailDialog(modal,{el,title:tr('删除家园'),className:'equipment-item-dialog home-name-dialog'});
 setActiveDialog(dialog);
 dialog.dialog.addEventListener('close',()=>{if(getActiveDialog()===dialog)setActiveDialog(null);dialog.dialog.remove();});
 const msg=el('p','home-dialog-confirm-text');
 msg.textContent=`${tr('删除')}“${targetHome.name}”？${tr('此操作不能撤销。')}`;
 const cancelBtn=button('取消',()=>dialog.close(),'secondary');
 const confirmBtn=button('删除家园',()=>{dialog.close();run(()=>cb.remove(targetHome,true));},'primary danger');
 dialog.body.append(msg);
 dialog.footer.append(cancelBtn,confirmBtn);
 dialog.open(trigger);
}

export function renderHomeManagerDirectory({body,model,cb,run,openNameDialog}){
 body.replaceChildren();body.className='home-body home-manager';
 const heroBanner=el('div','home-manager-banner');
 const bannerText=el('div','home-manager-banner-text');
 bannerText.append(el('h3','','选择或创建家园'));
 heroBanner.append(bannerText);
 const list=el('div','home-directory');list.setAttribute('aria-label','家园列表');
 for(const home of model.homes||[]){
  const card=button('',()=>run(()=>cb.enter(home)),'home-card home-entry');
  card.setAttribute('aria-label',home.name);
  if(home.visit?.preview?.startsWith('data:image/')||home.localVisit?.preview?.startsWith('data:image/')){
   const previewUrl=home.localVisit?.preview||home.visit?.preview;
   const preview=el('img','home-entry-preview');
   preview.src=previewUrl;preview.width=400;preview.height=300;preview.alt=tr('上次离开时的家园');
   card.append(preview);
  }else{
   const placeholder=el('div','home-entry-placeholder');
   const b=homeBiomeAt(home.seed||1,0,0);
   placeholder.style.background=`linear-gradient(135deg, ${b.grassA}, ${b.waterShallow})`;
   placeholder.append(el('span','home-entry-biome-tag',b.name));
   card.append(placeholder);
  }
  const info=el('span','home-entry-info');
  info.append(el('strong','',home.name));
  const visit=home.localVisit,updated=Math.max(home.updatedAt||0,visit?.lastPlayedAt||0);
  info.append(
   el('small','',`${tr('更新于')} ${formatHomeTime(updated)}`),
   el('small','',`${tr('已游玩')} ${visit?.playedMs?Math.floor(visit.playedMs/60000)>0?`${Math.floor(visit.playedMs/60000)} ${tr('分钟')}`:tr('不足1分钟'):tr('暂无记录')}`)
  );
  card.append(info);list.append(card);
 }
 const createBtn=button('新建家园',e=>openNameDialog({trigger:e.currentTarget}),'home-card home-entry home-new');
 list.append(createBtn);
 body.append(heroBanner,list);
}
