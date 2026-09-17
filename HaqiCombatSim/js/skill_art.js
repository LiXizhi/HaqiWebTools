import {assetUrl} from './adventure_media_core.js';
import {skillFrame, validateSkillArt} from './skill_art_core.js';
import {expectedBaseDamage, expectedBaseHeal} from './combat_cards_core.js';

const schoolNames={ice:'寒冰',fire:'烈火',storm:'风暴',life:'生命',death:'死亡',balance:'通用'};
const colors={ice:'#70d9ff',fire:'#ff9749',storm:'#ffdc68',life:'#8fe88c',death:'#c795fa',balance:'#e8cc84'};
async function read(url){const r=await fetch(url);if(!r.ok)throw new Error('技能美术配置读取失败');return r.json();}
export async function loadSkillArt(effects, mode) {
    const [manifest,frames]=await Promise.all([read('data/adventure/skill-art.json'),read('data/adventure/card-frames.json')]);
    validateSkillArt(manifest,effects);
    const images=new Map(),pending=new Map();
    function load(id,row){
        if(!pending.has(id))pending.set(id,new Promise((resolve,reject)=>{
            const image=new Image();image.crossOrigin='anonymous';
            image.onload=()=>{images.set(id,image);resolve(image);};
            image.onerror=()=>{pending.delete(id);reject(new Error('技能图集加载失败：'+id));};
            image.src=assetUrl(row,mode);
        }));
        return pending.get(id);
    }
    await Promise.all(Object.entries(frames.entries).map(([school,row])=>load('frame:'+school,row)));
    function ensure(base){
        const row=manifest.bases[base];if(!row)return Promise.reject(new Error('缺少技能主体：'+base));
        const id=row.effectAtlas||row.atlas;
        return load(id,manifest.sheets[id]);
    }
    function drawSubject(c,base,x,y,w,h,progress=null){
        const frame=skillFrame(manifest,base,progress),image=images.get(frame.atlas);
        if(!image)return false;
        const size=Math.min(w,h);c.drawImage(image,...frame.rect,x+(w-size)/2,y+(h-size)/2,size,size);return true;
    }
    function drawCard(c,card,{name,description,cooldown=0,details=true,width=302,height=460}={}){
        const reference=effects.cards[card.key],base=reference?.base;if(!base)return false;
        const school=card.spellSchool,background=images.get('frame:'+(school==='balance'?'storm':school));
        c.save();c.scale(width/302,height/460);c.clearRect(0,0,302,460);c.drawImage(background,0,0,302,460);
        c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';c.lineWidth=5;c.strokeStyle='#172431';
        c.font='900 27px "Microsoft YaHei",sans-serif';const title=name||reference.name;
        c.strokeText(title,151,52,218);c.fillStyle='#fffde5';c.fillText(title,151,52,218);
        c.font='bold 25px sans-serif';c.fillStyle=colors[school];c.strokeText(schoolNames[school][0],28,27);c.fillText(schoolNames[school][0],28,27);
        c.save();c.beginPath();c.rect(22,87,258,180);c.clip();drawSubject(c,base,42,68,218,218);c.restore();
        c.fillStyle='#204450';c.font='bold 17px sans-serif';c.fillText(expectedBaseHeal(card)?'愈':expectedBaseDamage(card)?'攻':'辅',266,278);
        if(details){
            c.fillStyle='#1b3940';c.font='bold 22px sans-serif';c.fillText(card.pipcost<0||card.pipcost===114||card.pipcost==='X'?'X':String(card.pipcost),276,28);c.fillText(String(cooldown),36,277);
            const text=description||cardDescription(card),lines=[];let line='';
            c.font='bold 18px "Microsoft YaHei",sans-serif';
            for(const ch of text){if(c.measureText(line+ch).width>218){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);
            c.textAlign='left';c.textBaseline='top';lines.slice(0,5).forEach((value,i)=>c.fillText(value,41,307+i*23));
        }
        const aura=effects.variantAuras[reference.variant.rank];
        if(aura?.color){c.strokeStyle=aura.color;c.lineWidth=3;c.shadowColor=aura.color;c.shadowBlur=8;c.strokeRect(5,5,292,450);}
        c.restore();return true;
    }
    return {manifest,images,ensure,drawSubject,drawCard,async preload(cards){await Promise.all([...new Set(Object.values(cards).map(c=>effects.cards[c.key]?.base).filter(Boolean))].map(ensure));}};
}
export function cardDescription(card){
    const damage=expectedBaseDamage(card),heal=expectedBaseHeal(card);
    if(damage)return `基础伤害 ${Math.round(damage)}${heal?' · 治疗 '+Math.round(heal):''} · 命中 ${card.accuracy}%`;
    if(heal)return `基础治疗 ${Math.round(heal)} · 命中 ${card.accuracy}%`;
    const type=card.type;
    if(/Absorb|Guardian/.test(type))return '吸收伤害，保护目标';
    if(/Ward|Shield/.test(type))return '护盾或陷阱，改变受到的伤害';
    if(/Charm/.test(type))return '施加增益或减益效果';
    if(/Stun|Freeze/.test(type))return '控制目标行动';
    if(/Pip/.test(type))return '改变魔力点';
    if(/Global|Aura|Stance/.test(type))return '改变场地或姿态效果';
    if(/Pass/.test(type))return '跳过当前回合';
    if(/Fizzle/.test(type))return '施法失败，魔力消散';
    return '辅助魔法';
}
