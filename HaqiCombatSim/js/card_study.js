import {CardRenderer} from './card_renderer.js';
import {assetMode,assetUrl} from './adventure_media_core.js';
import {fetchJson} from './runtime_data.js';
const schools=[['ice','寒冰','#4ecfff','坚固壁垒'],['fire','烈火','#ff743b','烈火护盾'],['storm','风暴','#ffdf52','风暴护盾'],['life','生命','#82df67','生命护盾'],['death','死亡','#c094ff','死亡护盾']];
const $=id=>document.getElementById(id),cards=[],TAU=Math.PI*2;let golden=false;
function polygon(c,points,fill,stroke='#fcf3bf',width=2){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}
function draw(row){const {c,image,school,color,title}=row;
 const effects={cards:{demo:{base:'demo',name:title,variant:{rank:'normal'}}},variantAuras:{normal:{}}};
 const renderer=new CardRenderer({images:new Map([['frame:'+school,image]]),effects,drawSubject:()=>false});
 renderer.draw(c,{key:'demo',spellSchool:school,pipcost:Number($('cost').value),type:'Wards',params:{}},{name:title,description:'抵挡下一次受到的'+row.name+'伤害 50% · 守护 · 单体',cooldown:$('left').value,backgroundOnly:!$('content').checked,golden,subject(c){
 // All central artwork is live Canvas geometry; no artwork is baked into the frame.
 c.save();c.translate(151,178);c.shadowColor=color;c.shadowBlur=20;polygon(c,[[0,-56],[48,-32],[40,24],[0,62],[-40,24],[-48,-32]],'#d7e5de','#fff5c2',3);c.shadowBlur=0;
 const g=c.createLinearGradient(-30,-35,30,45);g.addColorStop(0,color);g.addColorStop(.5,'#163a55');g.addColorStop(1,'#071e31');polygon(c,[[0,-46],[36,-26],[30,18],[0,47],[-30,18],[-36,-26]],g,'#77959c',2);renderer.drawSchoolIcon(c,school,0,-1,45,color);c.restore();

 }});}
function redraw(){cards.forEach(draw);}
$('content').onchange=redraw;$('cost').oninput=redraw;$('left').oninput=redraw;$('gold').onclick=()=>{golden=!golden;$('gold').setAttribute('aria-pressed',golden);$('gold').textContent='金卡光环：'+(golden?'开':'关');redraw();};
try{const manifest=await fetchJson('data/adventure/card-frames.json'),mode=assetMode(location.hostname,location.search);
 await Promise.all(schools.map(async([school,name,color,title])=>{const article=document.createElement('article'),canvas=document.createElement('canvas');canvas.width=604;canvas.height=920;canvas.setAttribute('aria-label',name+'卡牌样张');const c=canvas.getContext('2d');c.scale(2,2);const h=document.createElement('h2');h.textContent=name;h.style.color=color;const meta=document.createElement('p');meta.className='meta';meta.textContent='AI 底图 + 程序内容';article.append(canvas,h,meta);$('cards').append(article);const image=new Image();image.crossOrigin='anonymous';await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(name+'底图加载失败'));image.src=assetUrl(manifest.entries[school],mode);});const row={c,image,school,name,color,title};cards.push(row);draw(row);}));
 $('status').textContent='五系样张已加载。可切换纯底图，或修改数字检查程序分层。';
}catch(e){$('status').textContent=e.message;}
