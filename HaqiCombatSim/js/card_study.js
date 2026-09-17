import {assetMode,assetUrl} from './adventure_media_core.js';
const schools=[['ice','寒冰','#4ecfff','坚固壁垒'],['fire','烈火','#ff743b','烈火护盾'],['storm','风暴','#ffdf52','风暴护盾'],['life','生命','#82df67','生命护盾'],['death','死亡','#c094ff','死亡护盾']];
const $=id=>document.getElementById(id),cards=[],TAU=Math.PI*2;let golden=false;
function path(c,points,fill,stroke='#fcf3bf',width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}
function symbol(c,school,x,y,size,color){c.save();c.translate(x,y);c.scale(size/24,size/24);c.lineJoin='round';c.lineCap='round';c.strokeStyle=color;c.fillStyle=color;c.lineWidth=2.5;
 if(school==='ice'){for(const [dx,dy,r]of [[0,-2,10],[-8,6,4],[8,6,4]]){path(c,[[dx,dy-r],[dx+r*.6,dy],[dx,dy+r],[dx-r*.6,dy]],color,'#fff2a9',1.2);path(c,[[dx,dy-r],[dx,dy+r],[dx-r*.6,dy]],'#0874bd','#fff2a9',.5);}}
 if(school==='fire'){c.beginPath();c.moveTo(0,-12);c.bezierCurveTo(-2,-3,-11,-4,-10,4);c.bezierCurveTo(-8,15,10,13,10,3);c.bezierCurveTo(9,-2,5,-6,5,-8);c.bezierCurveTo(5,-2,0,0,0,-12);c.fill();}
 if(school==='storm')path(c,[[3,-12],[-10,2],[-1,2],[-4,12],[11,-4],[2,-4]],color,color,1);
 if(school==='life'){c.beginPath();c.moveTo(-8,9);c.bezierCurveTo(-13,-3,-3,-11,11,-10);c.bezierCurveTo(12,5,3,13,-8,9);c.fill();c.strokeStyle='#235334';c.beginPath();c.moveTo(-7,8);c.lineTo(6,-5);c.stroke();}
 if(school==='death'){c.beginPath();c.arc(0,-3,10,0,TAU);c.fill();c.fillRect(-6,3,12,8);c.fillStyle='#372442';for(const x of [-4,4]){c.beginPath();c.ellipse(x,-3,2.7,3.3,0,0,TAU);c.fill();}c.fillRect(-1,6,2,5);}
 c.restore();}
function badge(c,x,y,r,value){const g=c.createRadialGradient(x-4,y-5,2,x,y,r);g.addColorStop(0,'#fbffdc');g.addColorStop(.8,'#d9fca7');g.addColorStop(1,'#82cd3d');c.fillStyle=g;c.strokeStyle='#e3ef8c';c.lineWidth=2;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.stroke();if(value!==null){c.fillStyle='#254a29';c.font='bold 23px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(value,x,y+1);}}
function draw(row){const {c,image,school,color,title}=row;c.clearRect(0,0,302,460);c.drawImage(image,0,0,302,460);if(!$('content').checked)return;
 c.save();c.textAlign='center';c.textBaseline='middle';c.font='900 27px "PingFang SC",sans-serif';c.lineJoin='round';c.lineWidth=5;c.strokeStyle='#252528';c.strokeText(title,151,63,232);c.fillStyle='#fffef2';c.fillText(title,151,63,232);
 symbol(c,school,25,26,30,color);badge(c,277,28,15,$('cost').value);badge(c,36,276,19,$('left').value);
 badge(c,267,276,16,null);path(c,[[267,266],[278,270],[275,282],[267,287],[259,282],[256,270]],'#19374d','#e9db83',1.5);
 // All central artwork is live Canvas geometry; no artwork is baked into the frame.
 c.save();c.translate(151,192);c.shadowColor=color;c.shadowBlur=20;path(c,[[0,-56],[48,-32],[40,24],[0,62],[-40,24],[-48,-32]],'#d7e5de','#fff5c2',3);c.shadowBlur=0;
 const g=c.createLinearGradient(-30,-35,30,45);g.addColorStop(0,color);g.addColorStop(.5,'#163a55');g.addColorStop(1,'#071e31');path(c,[[0,-46],[36,-26],[30,18],[0,47],[-30,18],[-36,-26]],g,'#77959c',2);symbol(c,school,0,-1,45,color);c.restore();
 c.fillStyle='#173b4b';c.textAlign='left';c.textBaseline='top';c.font='bold 19px "PingFang SC",sans-serif';c.fillText('抵挡下一次受到的',40,310);c.fillText(row.name+'伤害 50%',40,337);c.font='15px "PingFang SC",sans-serif';c.fillStyle='#315164';c.fillText('守护 · 单体',40,379);
 if(golden){c.shadowColor='#ffd65b';c.shadowBlur=12;c.strokeStyle='#ffe69a';c.lineWidth=3;c.strokeRect(5,5,292,450);}c.restore();}
function redraw(){cards.forEach(draw);}
$('content').onchange=redraw;$('cost').oninput=redraw;$('left').oninput=redraw;$('gold').onclick=()=>{golden=!golden;$('gold').setAttribute('aria-pressed',golden);$('gold').textContent='金卡光环：'+(golden?'开':'关');redraw();};
try{const r=await fetch('data/adventure/card-frames.json');if(!r.ok)throw new Error('底图尚未准备');const manifest=await r.json(),mode=assetMode(location.hostname,location.search);
 await Promise.all(schools.map(async([school,name,color,title])=>{const article=document.createElement('article'),canvas=document.createElement('canvas');canvas.width=604;canvas.height=920;canvas.setAttribute('aria-label',name+'卡牌样张');const c=canvas.getContext('2d');c.scale(2,2);const h=document.createElement('h2');h.textContent=name;h.style.color=color;const meta=document.createElement('p');meta.className='meta';meta.textContent='AI 底图 + 程序内容';article.append(canvas,h,meta);$('cards').append(article);const image=new Image();image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(name+'底图加载失败'));image.src=assetUrl(manifest.entries[school],mode);});const row={c,image,school,name,color,title};cards.push(row);draw(row);}));
 $('status').textContent='五系样张已加载。可切换纯底图，或修改数字检查程序分层。';
}catch(e){$('status').textContent=e.message;}
