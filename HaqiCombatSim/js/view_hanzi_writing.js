import {drawHanziGlyph} from './hanzi_animation.js';
export function createHanziWriting(canvas,glyph,{hint=true,onChange=()=>{}}={}){
 const c=canvas.getContext('2d');canvas.width=600;canvas.height=600;canvas.style.touchAction='none';
 let strokes=[],active=null,pointer=null,showHint=hint,disabled=false,demo=0,timer=0;
 const abort=new AbortController();
 function paint(){
  c.clearRect(0,0,600,600);c.fillStyle='#fffbef';c.fillRect(0,0,600,600);c.strokeStyle='#d4c8ac';c.lineWidth=1.5;c.setLineDash([8,8]);
  for(const path of [[[300,0],[300,600]],[[0,300],[600,300]],[[0,0],[600,600]],[[600,0],[0,600]]]){c.beginPath();c.moveTo(...path[0]);c.lineTo(...path[1]);c.stroke();}c.setLineDash([]);
  if(showHint||demo){c.save();c.globalAlpha=demo?.7:.15;drawHanziGlyph(c,glyph,0,0,600,demo||1);c.restore();}
  c.lineWidth=13;c.strokeStyle='#345b50';c.lineCap='round';c.lineJoin='round';
  for(const stroke of [...strokes,...(active?[active]:[])]){c.beginPath();stroke.forEach(([x,y],i)=>i?c.lineTo(x*600,y*600):c.moveTo(x*600,y*600));c.stroke();}
 }
 const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];};
 canvas.addEventListener('pointerdown',e=>{if(disabled||pointer!==null||e.button>0)return;e.preventDefault();clearInterval(timer);demo=0;pointer=e.pointerId;active=[point(e)];canvas.setPointerCapture(pointer);paint();},{signal:abort.signal});
 canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointer||!active)return;if(active.length<4096)active.push(point(e));paint();},{signal:abort.signal});
 canvas.addEventListener('pointerup',e=>{if(e.pointerId!==pointer||!active)return;active.push(point(e));strokes.push(active);active=null;pointer=null;paint();onChange(strokes.length);},{signal:abort.signal});
 canvas.addEventListener('pointercancel',()=>{active=null;pointer=null;paint();},{signal:abort.signal});
 canvas.addEventListener('lostpointercapture',()=>{if(active){active=null;pointer=null;paint();}},{signal:abort.signal});
 paint();
 return {get strokes(){return structuredClone(strokes);},hint(value){showHint=value;paint();},clear(){strokes=[];active=null;pointer=null;paint();onChange(0);},undo(){strokes.pop();paint();onChange(strokes.length);},disable(value){disabled=value;},demonstrate(){clearInterval(timer);strokes=[];active=null;pointer=null;demo=.001;timer=setInterval(()=>{demo+=.012;paint();if(demo>=1){clearInterval(timer);demo=0;paint();}},40);},dispose(){abort.abort();clearInterval(timer);}};
}
