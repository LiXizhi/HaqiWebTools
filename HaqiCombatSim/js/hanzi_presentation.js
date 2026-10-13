import {unlockedEffect} from './hanzi_core.js';
// Presentation adapter only. No mutations to cards, battle state or random generators.
export function createHanziPresentation(data,effects,getSave){
 function effect(card){const p=getSave()?.hanzi,base=effects.cards[card?.key]?.base,id=p?.equipped?.[base],row=data.effects.find(r=>r.id===id&&r.bases.includes(base));return row&&unlockedEffect(p,row)?row:null;}
 function badge(c,card,x=236,y=155){const row=effect(card);if(!row)return;c.save();c.fillStyle='#fff5dce8';c.strokeStyle=row.color;c.lineWidth=2;c.beginPath();c.roundRect(x-20,y-24,40,48,5);c.fill();c.stroke();c.fillStyle=row.color;c.textAlign='center';c.font='28px serif';c.fillText(row.glyph,x,y+10);c.restore();}
 function spell(c,{card,progress,from,to,reducedMotion=false}){const row=effect(card);if(!row||!from||!to)return;const p=Math.max(0,Math.min(1,progress)),save=getSave(),settings=save.hanzi;
  c.save();c.globalAlpha=Math.sin(p*Math.PI)*.92;c.translate(to.x,to.y-72);c.fillStyle=row.color;c.strokeStyle='#fff9e4';c.lineWidth=4;c.textAlign='center';c.font='bold 36px serif';const text=settings.effectMode==='idiom'?row.idiom:row.glyph;c.strokeText(text,0,0,180);c.fillText(text,0,0,180);
  if(settings.effectMode==='gloss'){c.font='12px sans-serif';c.strokeText(row.meaning,0,22,160);c.fillText(row.meaning,0,22,160);}
  if(!reducedMotion){c.strokeStyle=row.color;c.lineWidth=1.5;for(let i=0;i<8;i++){const angle=i*Math.PI/4+p*2,r=30+p*36;c.beginPath();c.moveTo(Math.cos(angle)*r,Math.sin(angle)*r*.4);c.lineTo(Math.cos(angle)*(r+8),Math.sin(angle)*(r+8)*.4);c.stroke();}}c.restore();
 }
 return {effect,badge,spell};
}
