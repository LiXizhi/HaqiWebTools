import {drawSchoolIcon} from './card_renderer.js';
import {tr,fill} from './locale_runtime.js';

// ObjectManager.lua RefreshBuffs L1837+: charm / ward / overtime / miniaura
// occupy separate attachment slots. The 2D view uses compact badges instead of 3D models.
export function battleStatusEffects(unit,battle) {
    const out=[],r=battle.resolved;
    const add=(kind,label,desc,template={},extra={})=>out.push({kind,label,desc,school:template.school,negative:template.positive===false,...extra});
    for(const w of unit.standingWards||[])if(w.rounds>0){
        const rank=(r.global?.stormChargingWardIds||[]).indexOf(w.id)+1;
        add('ward','印',`${rank?`狂风印记 ${rank}阶`:r.wards?.[w.id]?.desc||'持续护盾'} · ${w.rounds}回合`,r.wards?.[w.id],{stackKey:`standing:${w.id}:${w.rounds}`});
    }
    for(const id of unit.charms||[])if(id>0){
        const effect=r.charms?.[id];
        add('charm',effect?.dispel_school?'敌':'术',effect?.desc||`术 ${id}`,effect,{effectId:id,dispelSchool:effect?.dispel_school,school:effect?.dispel_school||effect?.school});
    }
    for(const w of unit.wards||[])if(w.absorb?w.pts>0:w.id>0){
        const tpl=r.wards?.[w.id];
        add('ward',w.absorb?'吸':tpl?.prism_from?'棱':tpl?.positive===false?'陷':'盾',w.absorb?`吸收盾 ${w.pts}`:tpl?.desc||`护盾 ${w.id}`,tpl,{stackKey:`ward:${w.id}:${!!w.absorb}`,prism:!!tpl?.prism_from});
    }
    // Match combat_unit_core.js dotRoundsRemaining / hotRoundsRemaining:
    // remaining ticks are the remaining duration, independently for each sequence.
    for(const kind of ['dots','hots'])for(const sequence of unit[kind]||[]){
        const rounds=sequence.ticks?.length||0;
        if(rounds>0)add(kind,kind==='dots'?'伤':'疗',`${kind==='dots'?'持续伤害':'持续治疗'} · 剩余${rounds}回合`,{}, {negative:kind==='dots',rounds,effectId:`${sequence.cardKey||''}:${sequence.casterId||''}`});
    }
    if(unit.stunned)add('stun','晕','眩晕',{}, {negative:true});
    if(unit.reflectAmount>0)add('reflect','镜',`反射盾 ${unit.reflectAmount}`,{school:'ice'});
    if(unit.stealth)add('stealth','隐',`隐身${unit.stealthRounds>0?` · ${unit.stealthRounds}回合`:''}`);
    if(unit.miniaura?.rounds>0)add('aura','环',`${r.miniauras?.[unit.miniaura.id]?.desc||'光环'} · ${unit.miniaura.rounds}回合`,r.miniauras?.[unit.miniaura.id]);
    return out;
}

// Group only the overhead presentation; roster details retain every layer/capacity.
export function overheadStatusEffects(unit,battle) {
    const effects=[],stacks=new Map();
    for(const effect of battleStatusEffects(unit,battle)){
        if(effect.stackKey&&stacks.has(effect.stackKey)){
            const stack=stacks.get(effect.stackKey);stack.count++;stack.descriptions.push(effect.desc);
        }
        else{
            const displayed={...effect,count:1,descriptions:[effect.desc]};effects.push(displayed);
            if(effect.stackKey)stacks.set(effect.stackKey,displayed);
        }
    }
    return effects;
}

// Native vector adaptation of the original FireDamageBlade circular rune,
// IceDamageTrap triangular seal and IceGreatShield ice-emblem shield thumbnails.
// Numeric badges show ward stack counts or periodic remaining duration.
function drawStatusIcon(c,effect,x,y,size) {
    c.save();c.translate(x,y);c.scale(size/32,size/32);
    const school=({water:'ice',metal:'storm',wood:'life',earth:'death',all:'balance'})[effect.school]||effect.school||'balance';
    const color=({fire:'#ff963e',ice:'#79dfff',storm:'#c699ff',life:'#94e676',death:'#c69bdd',balance:'#ffe29a'})[school]||'#ffe29a';
    c.lineWidth=1.8;c.lineJoin='round';c.lineCap='round';
    c.fillStyle=effect.negative?'#612637':'#164758';c.strokeStyle=effect.negative?'#ffad9a':'#ffe4a0';
    c.beginPath();
    if(effect.kind==='reflect'){
        c.ellipse(16,16,11,15,0,0,Math.PI*2);
    }else if(effect.kind==='ward'){
        if(effect.negative){c.moveTo(1,4);c.lineTo(31,4);c.lineTo(16,31);c.closePath();}
        else{c.moveTo(16,1);c.lineTo(29,6);c.lineTo(27,21);c.quadraticCurveTo(23,27,16,31);c.quadraticCurveTo(9,27,5,21);c.lineTo(3,6);c.closePath();}
    }else c.arc(16,16,14,0,Math.PI*2);
    c.fill();c.stroke();
    c.strokeStyle=color;c.fillStyle=color;
    if(effect.kind==='charm'||effect.kind==='ward'||effect.kind==='aura'){
        if(effect.kind!=='ward'){c.beginPath();c.arc(16,16,10.5,-Math.PI*.35,Math.PI*1.35);c.stroke();}
        drawSchoolIcon(c,school,16,effect.negative&&effect.kind==='ward'?13:16,17,color);
        if(effect.label==='吸'){c.beginPath();c.arc(16,16,9,0,Math.PI*2);c.stroke();}
        if(effect.negative&&effect.kind==='charm'){c.strokeStyle='#ffb4a7';c.beginPath();c.moveTo(7,25);c.lineTo(25,7);c.stroke();}
    }else if(effect.kind==='hots'){
        c.fillStyle='#9cf38d';c.beginPath();c.moveTo(16,25);c.bezierCurveTo(-3,14,10,3,16,12);c.bezierCurveTo(22,3,35,14,16,25);c.fill();
    }else if(effect.kind==='dots'){
        drawSchoolIcon(c,'fire',16,14,19,'#ff9460');
        for(const dx of [10,16,22]){c.beginPath();c.arc(dx,26,1.4,0,Math.PI*2);c.fill();}
    }else if(effect.kind==='stun'){
        c.beginPath();c.ellipse(16,17,11,5,-.3,0,Math.PI*2);c.stroke();
        for(const [sx,sy,s] of [[9,11,9],[24,13,7],[17,24,6]])drawSchoolIcon(c,'balance',sx,sy,s,'#ffe38d');
    }else if(effect.kind==='stealth'){
        c.beginPath();c.moveTo(5,16);c.quadraticCurveTo(16,3,27,16);c.quadraticCurveTo(16,29,5,16);c.stroke();
        c.beginPath();c.arc(16,16,4,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(7,26);c.lineTo(25,6);c.stroke();
    }else if(effect.kind==='reflect'){
        const glass=c.createLinearGradient(7,5,25,27);
        glass.addColorStop(0,'#e8fcff');glass.addColorStop(.45,'#79bfd9');glass.addColorStop(.55,'#d9faff');glass.addColorStop(1,'#4383ab');
        c.fillStyle=glass;c.beginPath();c.ellipse(16,16,8,12,0,0,Math.PI*2);c.fill();c.stroke();
        c.strokeStyle='#ffffff';c.beginPath();c.moveTo(11,17);c.lineTo(19,8);c.moveTo(14,23);c.lineTo(22,14);c.stroke();
    }
    const badge=effect.rounds>0?effect.rounds:effect.count>1?effect.count:null;
    if(badge!==null){
        c.fillStyle='#fff0bd';c.beginPath();c.roundRect(18,18,14,14,4);c.fill();
        c.fillStyle='#342c26';c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';
        c.fillText(String(badge),25,25.5,13);
    }
    c.restore();
}

function statusPosition(at,width,total,index) {
    const size=28,gap=4,columns=4,rows=Math.ceil(total/columns);
    const bottom=Math.max(rows*(size+gap)+4,at.y-110);
    const row=Math.floor(index/columns),n=Math.min(columns,total-row*columns),span=n*(size+gap)-gap;
    const left=Math.max(4,Math.min(width-span-4,at.x-span/2));
    return {x:left+(index%columns)*(size+gap),y:bottom-(rows-row)*(size+gap)};
}

export function drawOverheadStatus(c,unit,battle,at,width,hp=unit.hp,presentedEffects=null) {
    if(hp<=0)return [];
    const effects=presentedEffects??overheadStatusEffects(unit,battle);
    const targets=[];
    const size=28;
    c.save();
    effects.forEach((effect,i)=>{
        const {x,y}=statusPosition(at,width,effects.length,i);
        drawStatusIcon(c,effect,x,y,size);
        targets.push({key:`${unit.id}:${effect.stackKey||`${effect.kind}:${i}`}`,x,y,width:size,height:size,
            description:[unit.name,effect.count>1?`数量：${effect.count}`:'',...new Set(effect.descriptions)].filter(Boolean).join('\n')});
    });
    c.restore();
    return targets;
}

// Short, deterministic vector feedback; no assets or combat RNG are needed.
function feedbackLabel(change) {
    if(change.kind==='dispel-break')return fill('{effect}破掉',{effect:tr(change.effect.desc)}).text;
    if(change.kind==='break')return change.effect.kind==='reflect'?'魔镜破碎':'护盾破碎';
    if(change.kind==='remove')return '效果解除';
    if(change.kind==='trigger'||change.kind==='pulse'){
        if(change.effect.kind==='dots')return '持续伤害触发';
        if(change.effect.kind==='hots')return '持续治疗触发';
        if(change.effect.prism)return '棱镜转化';
        if(change.effect.kind==='charm')return '术已触发';
        if(change.effect.kind==='ward'&&change.effect.negative)return '陷阱触发';
        return change.kind==='pulse'?'效果变化':'效果触发';
    }
    return change.effect.negative?'减益生效':change.effect.kind==='charm'?'术加成':'效果生效';
}

export function drawStatusFeedback(c,changes,at,time,reduced=false,width=1000) {
    for(const change of changes){
        const progress=Math.max(0,(time-change.start)/700);
        if(progress>=1)continue;
        const anchor=statusPosition(at,width,change.total||1,change.slot||0);
        const x=Math.max(26,Math.min(width-26,anchor.x+14)),y=Math.max(26,anchor.y+14);
        const size=reduced?32:28+20*Math.sin(Math.PI*Math.min(1,progress*1.5));
        const breaking=change.kind==='break'||change.kind==='dispel-break',trigger=change.kind==='trigger';
        const label=tr(feedbackLabel(change));
        c.save();c.globalAlpha=1-progress*.85;
        if(!reduced){
            c.strokeStyle=breaking?'#a7eaff':trigger?'#ffd979':'#a4f4d2';c.lineWidth=2;
            if(breaking){
                for(let j=0;j<7;j++){
                    const a=j*Math.PI*2/7,r=12+progress*33;
                    const sx=x+Math.cos(a)*r,sy=y+Math.sin(a)*r+progress*12;
                    c.beginPath();c.moveTo(sx,sy-5);c.lineTo(sx+6,sy+3);c.lineTo(sx-4,sy+5);c.closePath();c.stroke();
                }
            }else{c.beginPath();c.arc(x,y,16+progress*25,0,Math.PI*2);c.stroke();}
        }
        if(breaking&&!reduced&&progress>.25){
            // Split the actual shield icon into four moving pieces.
            for(let j=0;j<4;j++){
                const dx=j%2?1:-1,dy=j<2?-1:1,travel=(progress-.25)*32;
                c.save();c.translate(dx*travel,dy*travel+progress*8);
                c.beginPath();c.rect(x+(dx<0?-size/2:0),y+(dy<0?-size/2:0),size/2,size/2);c.clip();
                drawStatusIcon(c,change.effect,x-size/2,y-size/2,size);c.restore();
            }
        }else drawStatusIcon(c,change.effect,x-size/2,y-size/2,size);
        c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='top';
        c.lineWidth=3;c.strokeStyle='#153a43';c.fillStyle='#fff0b8';
        if(changes.length<=2){c.strokeText(label,x,y+30);c.fillText(label,x,y+30);}c.restore();
    }
}

export function drawSpellMiss(c,at,progress,reduced=false) {
    if(!at)return;
    c.save();c.globalAlpha=1-Math.max(0,progress-.65)*2;
    c.font='bold 30px sans-serif';c.textAlign='center';c.textBaseline='middle';
    c.lineWidth=4;c.strokeStyle='#173843';c.fillStyle='#f7dba8';
    const y=at.y-48-(reduced?0:progress*12);
    c.strokeText('MISS',at.x,y);c.fillText('MISS',at.x,y);c.restore();
}
