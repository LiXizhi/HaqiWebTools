import {validHomeDrawing} from './home_drawing_core.js';
export function paintHomeDrawing(ctx,drawing,x,y,w,h){
 ctx.save();ctx.fillStyle='#fffdf5';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#bcae88';ctx.lineWidth=1;ctx.strokeRect(x,y,w,h);
 const dw=Math.min(w,h*1.5),dh=dw/1.5,dx=x+(w-dw)/2,dy=y+(h-dh)/2;
 ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Math.max(1,dw/100);
 if(drawing&&validHomeDrawing(drawing))for(const stroke of drawing.strokes){ctx.strokeStyle=stroke.color;ctx.beginPath();if(stroke.points.length===1){const [a,b]=stroke.points[0];ctx.fillStyle=stroke.color;ctx.arc(dx+a*dw/1000,dy+b*dh/1000,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();}else{stroke.points.forEach(([a,b],i)=>{if(i)ctx.lineTo(dx+a*dw/1000,dy+b*dh/1000);else ctx.moveTo(dx+a*dw/1000,dy+b*dh/1000);});ctx.stroke();}}
 ctx.restore();
}
