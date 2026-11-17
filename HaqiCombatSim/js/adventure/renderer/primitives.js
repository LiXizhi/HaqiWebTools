import {catalogNpcMarker,trackedQuestIds} from '../../adventure_catalog_quests_core.js';
import {currentQuest,questReady,questState,questProgress,catalogStatSnapshot} from '../../adventure_core.js';
import {drawSchoolIcon} from '../../card_renderer.js';
import {tr} from '../../locale_runtime.js';

export const COLORS={fire:'#e98f44',ice:'#6ecbdc',storm:'#b39aea',life:'#84bd59',death:'#a887c7'};
export const TAU=Math.PI*2;
// Battle heroes share a 90px nominal height, close to the 99px monster frame.
export const BATTLE_HERO_SCALE=90/78;

export function ellipse(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
export function text(c,value,x,y,size=13,color='#fff',align='center') {const shown=tr(value);c.font=`600 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`;c.textAlign=align;c.fillStyle=color;c.fillText(shown,x,y);}

// Soft scene palette restored by user preference (2026-09-27).
export const PLATE={
    hero:{text:'#b8ddff'},
    npc:{text:'#fff0b5'},
    social:{text:'#9ff5e5'},
    mob:{text:'#ffc6b3'},
    place:{text:'#fbf6d7',bg:'rgba(24,55,46,.78)'},
};
const plateWidths=new Map();
export function plate(c,label,x,y,style=PLATE.place,school=null) {
    const shown=tr(label);
    if(school){
        c.save();c.font='600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
        const iconSize=26,iconGap=6,width=c.measureText(shown).width;
        const iconX=x-(width+iconSize+iconGap)/2+iconSize/2;
        drawSchoolIcon(c,school,iconX,y-3,iconSize);
        c.restore();x+=(iconSize+iconGap)/2;
    }
    if(!style.bg){c.save();c.shadowColor='#10251f';c.shadowBlur=4;c.shadowOffsetX=0;c.shadowOffsetY=2;text(c,shown,x,y+2,12,style.text);c.restore();return;}
    c.font='600 12px "PingFang SC", sans-serif';
    let width=plateWidths.get(shown);
    if(width===undefined){width=c.measureText(shown).width+20;plateWidths.set(shown,width);if(plateWidths.size>256)plateWidths.delete(plateWidths.keys().next().value);}
    c.beginPath();c.roundRect(x-width/2,y-14,width,23,8);c.fillStyle=style.bg;c.fill();
    if(style.stroke){c.strokeStyle=style.stroke;c.lineWidth=1.5;c.stroke();}
    text(c,shown,x,y+2,12,style.text);
}
export function circleRune(c,x,y,r,t,color='#e4d69a') {
    c.save();c.translate(x,y);c.scale(1,.53);c.strokeStyle=color;c.lineWidth=2;
    c.beginPath();c.arc(0,0,r,0,TAU);c.stroke();c.beginPath();c.arc(0,0,r*.83,0,TAU);c.stroke();
    c.rotate(t*.05);c.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+i*TAU/5;c.lineTo(Math.cos(a)*r*.75,Math.sin(a)*r*.75);}c.stroke();
    for(let i=0;i<8;i++){c.save();c.rotate(i*TAU/8);c.strokeRect(r*.89,-3,5,6);c.restore();}c.restore();
}
// NPC chat invitation; the click target follows the drawn rect.
export function drawSpeechBubble(c,at,t,reduced) {
    const float=reduced?0:Math.sin(t*2.2)*2.5;
    const w=24,h=16,x=at.x,y=at.y-66-float;
    c.fillStyle='#fffbe9';c.strokeStyle='#7a6335';c.lineWidth=1.5;
    c.beginPath();c.roundRect(x-w/2,y-h,w,h,7);c.fill();c.stroke();
    c.beginPath();c.moveTo(x-5,y-1);c.lineTo(x+5,y-1);c.lineTo(x,y+5);c.closePath();c.fill();
    c.beginPath();c.moveTo(x-5,y-1.7);c.lineTo(x,y+4.3);c.lineTo(x+5,y-1.7);c.stroke();
    c.fillStyle='#7a6335';
    for(let i=-1;i<=1;i++){c.beginPath();c.arc(x+i*6,y-h/2,1.7,0,TAU);c.fill();}
    return {x:x-w/2-4,y:y-h-4,w:w+8,h:h+13};
}
export function questMarker(save,content,npcId,stats=()=>catalogStatSnapshot(save,content)) {
    const involved=trackedQuestIds(save,content).some(id=>{
        const tracked=content.catalogQuests?.byId[id];
        return tracked&&(tracked.startNpc===npcId||tracked.endNpc===npcId||tracked.groups.some(g=>g.kind==='talk'&&g.items.some(i=>i.id===npcId)));
    });
    if(involved){
        const mark=catalogNpcMarker(save,content,npcId,stats());
        if(mark)return mark;
    }
    const q=currentQuest(save,content);if(!q||!trackedQuestIds(save,content).includes(q.id))return null;
    if(!questState(save,q.id).accepted&&q.startNpc===npcId)return '!';
    if(questReady(save,q)&&q.endNpc===npcId)return '?';
    if(questState(save,q.id).accepted&&questProgress(save,q).some(g=>g.kind==='talk'&&g.id===npcId&&g.value<g.count))return '…';
    return null;
}
