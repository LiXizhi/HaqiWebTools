import {DetailDialog} from './view_detail_dialog.js';
import {HOME_DRAWING_COLORS} from './home_drawing_core.js';
import {paintHomeDrawing} from './view_home_drawing_art.js';
export function openHomeDrawing(parent,{el,button,obj,homeId,save}){
 const dialog=new DetailDialog(parent,{el,title:'画一张自己的小画',className:'equipment-item-dialog'});
 const canvas=el('canvas'),message=el('p'),tools=el('div');canvas.width=600;canvas.height=400;canvas.setAttribute('aria-label','画纸');canvas.style.cssText='width:100%;max-width:450px;aspect-ratio:3/2;touch-action:none;display:block;';
 let drawing=structuredClone(obj.drawing||{version:1,strokes:[]}),color=HOME_DRAWING_COLORS[0],active=null,busy=false;
 const paint=()=>paintHomeDrawing(canvas.getContext('2d'),drawing,0,0,canvas.width,canvas.height);
 const point=e=>{const r=canvas.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1000,(e.clientX-r.x)*1000/r.width))),Math.round(Math.max(0,Math.min(1000,(e.clientY-r.y)*1000/r.height)))];};
 canvas.onpointerdown=e=>{if(busy||active||e.button!==0)return;if(drawing.strokes.length>=32||drawing.strokes.reduce((n,s)=>n+s.points.length,0)>=1024){message.textContent='这张画已经很丰富了，可以保存，或撤回一笔再画。';return;}e.preventDefault();active={id:e.pointerId,stroke:{color,points:[point(e)]}};drawing.strokes.push(active.stroke);canvas.setPointerCapture(e.pointerId);paint();};
 canvas.onpointermove=e=>{if(!active||active.id!==e.pointerId||busy)return;const p=point(e),ps=active.stroke.points;if(drawing.strokes.reduce((n,s)=>n+s.points.length,0)>=1024){message.textContent='这张画已经很丰富了，可以保存，或撤回一笔再画。';return;}if(ps.length>=256){message.textContent='这一笔先画到这里，松开后可以继续画。';return;}if(Math.hypot(p[0]-ps.at(-1)[0],p[1]-ps.at(-1)[1])<3)return;ps.push(p);paint();};
 canvas.onpointerup=e=>{if(active?.id===e.pointerId){active=null;canvas.releasePointerCapture(e.pointerId);}};
 canvas.onpointercancel=()=>{if(active){drawing.strokes.pop();active=null;paint();}};
 canvas.onlostpointercapture=canvas.onpointercancel;
 for(const [i,c] of HOME_DRAWING_COLORS.entries())tools.append(button(['深绿','红色','蓝色','黄色','紫色'][i],()=>{color=c;}));
 tools.append(button('撤回一笔',()=>{if(busy||active)return;drawing.strokes.pop();paint();}),button('清空画纸',()=>{if(busy||active)return;drawing={version:1,strokes:[]};paint();}));
 const submit=button('保存小画',async()=>{if(busy||active)return;busy=true;submit.disabled=true;try{await save(obj.id,structuredClone(drawing),homeId);dialog.destroy();}catch(e){message.textContent=e.message;busy=false;submit.disabled=false;}});
 dialog.body.append(el('p','','画你想画的东西，没有标准图案。按住画纸画线，保存后小画会留在家园；关闭窗口不会保存。'),tools,canvas,message,submit);dialog.open();paint();return dialog;
}
