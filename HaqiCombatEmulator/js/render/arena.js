import {SCHOOL_COLORS,SCHOOL_NAMES} from '../rules/formulas.js';
export function drawArena(canvas,battle,selected,onSelect,focus=null) {
  const width=canvas.clientWidth||700,height=canvas.clientHeight||325,dpr=window.devicePixelRatio||1;
  canvas.width=width*dpr;canvas.height=height*dpr;
  const c=canvas.getContext('2d');c.scale(dpr,dpr);
  const cx=width/2,cy=height*.5;
  const bg=c.createRadialGradient(cx,cy,5,cx,cy,width*.6);bg.addColorStop(0,'#23333b');bg.addColorStop(1,'#131e28');c.fillStyle=bg;c.fillRect(0,0,width,height);
  c.strokeStyle='#30424c';c.lineWidth=1;
  for(const radius of [height*.2,height*.31,height*.4]) {c.beginPath();c.ellipse(cx,cy,radius*1.35,radius,0,0,Math.PI*2);c.stroke();}
  c.save();c.translate(cx,cy);c.rotate(Math.PI/6);c.strokeStyle='#415049';
  c.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI*2/3;c.lineTo(Math.cos(a)*48,Math.sin(a)*48);}c.closePath();c.stroke();
  c.beginPath();c.arc(0,0,61,0,Math.PI*2);c.stroke();c.restore();
  c.font='10px system-ui';c.fillStyle='#677a84';c.textAlign='center';c.fillText('ARCANE ARENA',cx,cy+86);
  const positions=[];
  const radius=Math.min(width*.20,height*.32);
  c.beginPath();c.arc(cx,cy,radius,0,Math.PI*2);c.strokeStyle='#647a81';c.lineWidth=2;c.stroke();
  for(let i=0;i<battle.units.length;i++){const u=battle.units[i],a=-Math.PI/2+Math.PI/8+i*Math.PI*2/battle.units.length,x=cx+Math.cos(a)*radius,y=cy+Math.sin(a)*radius;c.beginPath();c.arc(x,y,focus?.caster===u.id||focus?.target===u.id?7:4,0,Math.PI*2);c.fillStyle=SCHOOL_COLORS[u.school];c.fill();c.font='9px system-ui';c.textAlign='center';if(width>=500)c.fillText(`${u.side===0?'A':'B'}${u.slot+1}`,cx+Math.cos(a)*(radius+15),cy+Math.sin(a)*(radius+15)+3);}

  for(const u of battle.units) {
    const size=battle.scenario.size,spacing=Math.min(72,(height-95)/size);
    const x=u.side===0?width*.23:width*.77,y=cy+(u.slot-(size-1)/2)*spacing;
    positions.push({id:u.id,x,y});
    const color=SCHOOL_COLORS[u.school];c.globalAlpha=u.hp>0?1:.27;
    c.fillStyle='#111b23';c.beginPath();c.ellipse(x,y+16,30,9,0,0,Math.PI*2);c.fill();
    c.strokeStyle=selected===u.id?'#efdaa9':color;c.lineWidth=selected===u.id?2:1;
    c.beginPath();c.arc(x,y-5,22,0,Math.PI*2);c.stroke();
    // Small 2D mage silhouette, colored by school; no asset/runtime dependency.
    c.fillStyle=color;c.beginPath();c.moveTo(x,y-20);c.lineTo(x-11,y-3);c.lineTo(x+11,y-3);c.closePath();c.fill();
    c.fillStyle='#eedbb7';c.beginPath();c.arc(x,y+1,5,0,Math.PI*2);c.fill();
    c.fillStyle=color;c.beginPath();c.moveTo(x-6,y+6);c.lineTo(x-12,y+19);c.lineTo(x+12,y+19);c.lineTo(x+6,y+6);c.closePath();c.fill();
    c.strokeStyle='#c6b281';c.beginPath();c.moveTo(x+15,y+17);c.lineTo(x+15,y-9);c.stroke();c.fillStyle=color;c.beginPath();c.arc(x+15,y-12,3,0,Math.PI*2);c.fill();
    const compact=width<500,labelX=x+(u.side===0?(compact?32:-37):(compact?-32:37));c.textAlign=u.side===0?(compact?'left':'right'):(compact?'right':'left');c.fillStyle='#d5dee2';c.font='11px system-ui';c.fillText(SCHOOL_NAMES[u.school],labelX,y-12);
    c.font='9px ui-monospace';c.fillStyle='#8d9ea9';c.fillText(compact?`${Math.ceil(u.hp)} HP`:`${Math.ceil(u.hp)} / ${u.attributes.maxHP}`,labelX,y+3);
    const barX=c.textAlign==='right'?labelX-58:labelX;c.fillStyle='#30404a';c.fillRect(barX,y+11,58,3);c.fillStyle=color;c.fillRect(barX,y+11,58*Math.max(0,u.hp/u.attributes.maxHP),3);
    c.fillStyle='#cfbd89';c.fillText('●'.repeat(Math.min(7,u.pips))+'◆'.repeat(u.powerPips)+(u.pips>7?` +${u.pips-7}`:''),labelX,y+28);
    c.globalAlpha=1;
  }
  const last=focus??[...battle.events].reverse().find(e=>e.type==='cast'||e.type==='damage'||e.type==='heal');
  if(last) {
    const a=positions.find(p=>p.id===last.caster),b=positions.find(p=>p.id===last.target);
    if(a&&b) {c.strokeStyle=last.type==='heal'?'#8dcea288':'#dac38a88';c.setLineDash([3,7]);c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo(cx,cy-40,b.x,b.y);c.stroke();c.setLineDash([]);const angle=Math.atan2(b.y-(cy-40),b.x-cx);c.fillStyle='#dac38a';c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-12*Math.cos(angle-.4),b.y-12*Math.sin(angle-.4));c.lineTo(b.x-12*Math.cos(angle+.4),b.y-12*Math.sin(angle+.4));c.closePath();c.fill();}
  }
  if(battle.finished) {c.fillStyle='#10171fcc';c.fillRect(cx-105,cy-34,210,65);c.fillStyle='#e7d29e';c.textAlign='center';c.font='20px system-ui';c.fillText(battle.result.winner==null?'本场平局':`${battle.result.winner===0?'A':'B'} 队获胜`,cx,cy+4);}
  canvas.onclick=e=>{const box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;const hit=positions.find(p=>Math.hypot(p.x-x,p.y-y)<34);if(hit)onSelect(hit.id);};
}
