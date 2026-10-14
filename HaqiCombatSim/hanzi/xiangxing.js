import {createRng} from '../js/rng_core.js';

// Shot order and approximate boundaries transcribed from the linked 331.2 s film.
// Illustrative glyphs below are artistic drawings, not historical transcriptions.
export const shots = [
  [0,25,'日山','天地初开','日出于山，万物有了模样。','dawn'],
  [25,40,'云雨','云行雨施','云聚成雨，落在大地的掌心。','rain'],
  [40,55,'花草','草木萌生','一枝花开，一寸草青。','flowers'],
  [55,72,'林果巢鸟','林间有声','木连成林，鸟归于巢。','forest'],
  [72,89,'羊鹿','山野生灵','草间有羊，林深见鹿。','animals'],
  [89,108,'鱼龟','水下世界','鱼游水中，龟行水畔。','fish'],
  [108,122,'水河','百川奔流','水有了方向，便成了河。','river'],
  [122,143,'人舟','一叶行舟','一人一舟，渡过万重山。','boat'],
  [143,160,'犁','春耕有时','以犁入土，种下一年的盼望。','farm'],
  [160,177,'创','秋收与创造','双手劳作，创造丰足的生活。','harvest'],
  [177,192,'建','筑起居所','一石一木，筑起遮风的地方。','build'],
  [192,204,'安','屋下心安','屋檐之下，有人等你归来。','home'],
  [204,216,'好','相伴为好','亲人相伴，日子便有了温度。','family'],
  [216,228,'画书','纸上山河','将眼前的山河，留在一纸之间。','write'],
  [228,240,'文','文以载意','有纹成文，有字传意。','culture'],
  [240,254,'乐礼','礼乐相和','钟磬声起，人们以礼相待。','music'],
  [254,265,'家','灯火可亲','有屋，有人，有归处。','village'],
  [265,278,'嫁','良辰佳期','红绸相系，两家结成一家。','wedding'],
  [278,287,'士','立于天地','有所学，也有所担当。','scholar'],
  [287,302,'国','城郭人间','城郭之内，万家同在。','city'],
  [302,310,'爸','父亲的臂弯','一双臂膀，撑起小小的家。','father'],
  [310,323,'梦','山河入梦','走过的山河，在梦里再次开花。','dream'],
  [323,331.2,'象形之美','万物入字','一字一世界，一笔一山河。','finale'],
].map(([start,end,glyph,title,verse,kind])=>({start,end,glyph,title,verse,kind}));
export const duration=331.2;
export function shotAt(time){return shots.findIndex(s=>time<s.end) < 0 ? shots.length-1 : shots.findIndex(s=>time<s.end);}
const $=id=>document.getElementById(id), canvas=$('film');
let ctx=canvas.getContext('2d');
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const ink='#294a42', red='#a24f38';
let time=0, playing=false, rate=1, last=0, current=-1, started=false, needsDraw=true;
let width=1200,height=608,dpr=1, reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const rng=createRng(20261014);
const flecks=Array.from({length:1900},()=>({x:rng.float()*1600,y:rng.float()*1000,a:rng.float(),r:rng.float()*1.4+.3}));
const foliage=Array.from({length:210},()=>({x:(rng.float()-.5)*2,y:(rng.float()-.5)*2,r:rng.float()*9+3,a:rng.float()}));
const ridges=Array.from({length:3},(_,layer)=>Array.from({length:7},(_,i)=>({x:i*295-100+rng.float()*130,y:420+layer*58+rng.float()*45,w:190+rng.float()*130,h:135+layer*25+rng.float()*105,seed:rng.float()*12})));
const cache=new Map();
function path(points,color=ink,line=2,fill=null){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(fill){ctx.closePath();ctx.fillStyle=fill;ctx.fill();}if(line){ctx.strokeStyle=color;ctx.lineWidth=line;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();}}
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,Math.abs(rx),Math.abs(ry),0,0,Math.PI*2);ctx.fill();}
function curve(points,color=ink,line=2){ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i+=3)ctx.bezierCurveTo(...points[i],...points[i+1],...points[i+2]);ctx.strokeStyle=color;ctx.lineWidth=line;ctx.lineCap='round';ctx.stroke();}
function glow(x,y,r,color){const g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
function bird(x,y,s,t){const wing=Math.sin(t*2.8)*s*.55;curve([[x-s,y-wing],[x-s*.55,y-s*.5],[x-s*.25,y-s*.3],[x,y],[x+s*.25,y-s*.3],[x+s*.55,y-s*.5],[x+s,y-wing]],'#39534bcc',1.8);}
function mountain(m,layer){
  const {x,y,w,h,seed}=m;
  const colors=['#b7c7b9','#88a99b','#537d70'];
  ctx.save();const g=ctx.createLinearGradient(0,y-h,0,y+110);g.addColorStop(0,colors[layer]);g.addColorStop(1,'#e9ead9');
  const pts=[[x-w,y+70]];
  for(let i=0;i<=50;i++){const u=i/50;const peak=Math.pow(Math.sin(u*Math.PI),1.7);pts.push([x-w+u*w*2,y-peak*h+Math.sin(u*31+seed)*9*peak+Math.sin(u*71+seed)*3]);}
  pts.push([x+w,y+100]);path(pts,null,0,g);
  for(let j=0;j<34;j++){const offset=(j/34-.5)*w*.85;const py=y-h+Math.abs(offset)*.9;curve([[x+offset*.4,py+25],[x+offset*.7+Math.sin(j)*12,py+h*.3],[x+offset*1.6,py+h*.6],[x+offset*2,y+55]],`rgba(35,78,65,${.02+(j%3)*.013})`,1+j%3);}
  ctx.restore();
}
function background(kind){
  const winter=kind==='build', night=['dream','finale'].includes(kind), autumn=['harvest','culture','music'].includes(kind),rainy=kind==='rain';
  const g=ctx.createLinearGradient(0,0,0,900);g.addColorStop(0,night?'#bfd0cc':winter?'#e0e8e3':'#eeecd9');g.addColorStop(.58,night?'#dde4d6':'#f2efdd');g.addColorStop(1,night?'#769d91':'#a7c2ae');ctx.fillStyle=g;ctx.fillRect(0,0,1600,900);
  if(!rainy){glow(1050,195,260,night?'#eef0cd88':'#e8b36b33');ellipse(1050,195,night?46:62,night?46:62,night?'#f6efd5':'#cc8b59');ellipse(1044,192,56,56,night?'#f4eddc00':'#dfa47366');}
  else{for(let i=0;i<5;i++){ctx.save();ctx.translate(i*350,85+Math.sin(i)*24);ctx.scale(3,1);glow(0,0,170,'#78918766');ctx.restore();}}
  ridges.forEach((row,l)=>row.forEach(m=>mountain(m,l)));
  for(let i=0;i<3;i++){ctx.save();ctx.translate(380+i*360,430+i*35);ctx.scale(8,1);glow(0,0,80,'#eef0df88');ctx.restore();}
  const water=ctx.createLinearGradient(0,500,0,900);water.addColorStop(0,night?'#a3beb0':'#cad6ba');water.addColorStop(1,night?'#527f77':'#739f8a');ctx.fillStyle=water;ctx.fillRect(0,550,1600,350);
  path([[0,530],[170,502],[340,533],[498,572],[730,581],[900,571],[1040,516],[1280,490],[1600,536],[1600,572],[1170,560],[1000,593],[780,624],[490,623],[220,556],[0,574]],null,0,winter?'#e8eee6':autumn?'#8e9b61':'#769b75');
  for(let i=0;i<8;i++){const x=120+i*42;tree(x,546-i*3,.19+i%3*.025,autumn?'autumn':winter?'winter':'pine',0);}
}
function texture(){ctx.save();ctx.globalCompositeOperation='multiply';for(const p of flecks){ctx.globalAlpha=p.a*.08;ellipse(p.x,p.y,p.r,p.r*.7,'#5c6950');}ctx.restore();}
function tree(x,y,s,type='pine',t=0){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.rotate(Math.sin(t*.35+x)*.006);
  const blossom=type==='blossom', autumn=type==='autumn', winter=type==='winter';
  curve([[0,0],[-12,-64],[18,-119],[4,-240]],'#4b5c45',12);
  for(let j=0;j<7;j++){
    const side=j%2?-1:1, yy=-66-j*25,xx=side*(75-j*5);
    curve([[0,yy+35],[side*24,yy+16],[xx*.7,yy-6],[xx,yy-16]],'#526249',5-j*.4);
    if(!winter)for(let i=0;i<foliage.length/3;i++){const p=foliage[(i+j*23)%foliage.length];const px=xx*.72+p.x*(blossom?47:63),py=yy-10+p.y*(blossom?31:24);const col=blossom?['#ae6560','#c98177','#e5b2a0','#f0c4ae']:autumn?['#977043','#bc8945','#ceaa5b','#747c48']:['#355e4e','#547d59','#7b965f','#a1ae7c'];ellipse(px,py,p.r*(blossom?.8:1.4),p.r*.6,col[i%4]);}
    if(winter)curve([[xx,yy-17],[xx*.8,yy-23],[xx*.5,yy],[0,yy+15]],'#edf1e8',5);
  }
  path([[-16,0],[-27,5],[4,2],[28,6]],'#566249',3);ctx.restore();
}
function bank(color='#8caa75'){path([[0,755],[130,708],[290,722],[460,696],[640,724],[810,702],[1010,714],[1190,668],[1400,695],[1600,720],[1600,900],[0,900]],null,0,color);curve([[0,756],[320,699],[660,750],[940,717],[1180,677],[1430,701],[1600,722]],'#d9dbac',4);}
function grasses(t,flower=false){for(let i=0;i<60;i++){const x=70+i*26,y=760+Math.sin(i*7)*36,hh=15+i%7*6;curve([[x,y],[x-5,y-hh*.4],[x+Math.sin(t+i)*5,y-hh*.8],[x+8,y-hh]],'#688658aa',1.5);if(flower&&i%3===0)for(let p=0;p<5;p++){const a=p*Math.PI*2/5;ellipse(x+8+Math.cos(a)*6,y-hh+Math.sin(a)*6,5,3,['#bb6b62','#e1b393','#ce9b73'][i%3]);}}}
function water(t,under=false){ctx.save();for(let i=0;i<65;i++){const x=(i*137.17+t*(i%2?4:-3))%1750-100,y=566+(i*41.73)%324,l=12+i%8*11;curve([[x,y],[x+l*.3,y+1.8],[x+l*.7,y-1.6],[x+l,y]],under?'#e3e9c733':'#eff0d65c',.8+i%3*.4);}for(let i=0;i<20;i++){const y=571+i*9,x=1050+Math.sin(i*4+t*.3)*18;path([[x-i*2,y],[x+i*3+20,y]],'#e8d5a444',2);}ctx.restore();}
function person(x,y,s,t=0,robe='#566e60',pose='stand'){
  ctx.save();ctx.translate(x,y);ctx.scale(s,s);const bob=pose==='walk'?Math.sin(t*3)*2:0;ctx.translate(0,bob);
  ellipse(0,0,20,4,'#2e493b22');path([[-8,-31],[-10+Math.sin(t*3)*3,-2]],'#3e4940',5);path([[7,-31],[10-Math.sin(t*3)*3,-2]],'#3e4940',5);
  path([[-10,-65],[10,-65],[20,-23],[-20,-23]],'#53624d',1,robe);path([[-8,-62],[5,-45],[10,-62]],'#e0d5ab',2);path([[-15,-37],[14,-37]],'#ba9c69',3);
  ellipse(0,-78,10,13,'#c8ad81');ellipse(-1,-87,11,6,'#36483c');ellipse(-3,-94,5,5,'#36483c');path([[5,-79],[8,-78]],ink,1);
  if(pose==='row')path([[-9,-58],[-25,-38],[30,-48]],'#c7ac80',6);else if(pose==='write')path([[-11,-57],[4,-46],[25,-51]],'#c7ac80',6);else{path([[-12,-58],[-20,-37],[-14,-32]],robe,8);path([[12,-58],[21,-41],[17,-32]],robe,8);}
  ctx.restore();
}
function boat(t){const x=820+Math.sin(t*.08)*105,y=685+Math.sin(t*.8)*3;ctx.save();ctx.translate(x,y);ellipse(0,20,158,12,'#416a5e22');path([[-152,-5],[-115,28],[102,28],[150,-11],[78,4],[-91,3]],'#665d40',2,'#8e7d50');curve([[-146,-6],[-68,8],[65,12],[151,-11]],'#c8b380',4);for(let i=-100;i<110;i+=20)path([[i,7],[i+8,24]],'#665e43',1);person(20,-2,1.25,t,'#586955','row');const a=Math.sin(t*.65)*.13;ctx.rotate(a);path([[58,-103],[-34,72]],'#6a6743',5);ctx.restore();}
function animal(x,y,s,type,t){ctx.save();ctx.translate(x,y);ctx.scale(s,s);const deer=type==='deer', ox=type==='ox';ellipse(0,-31,ox?48:37,ox?24:20,deer?'#a78d60':ox?'#657264':'#e8e5cb');for(let i=0;i<4;i++){const xx=-23+i*15;path([[xx,-21],[xx+Math.sin(t*1.5+i)*3,0]],'#766c4e',4);}path([[22,-34],[35,-62],[47,-65]],deer?'#a78d60':'#c4c2a3',14);ellipse(48,-65,12,8,deer?'#a78d60':'#d4d1b4');ellipse(52,-67,1.6,1.6,ink);if(deer){path([[38,-70],[29,-92],[20,-98]],'#7b7050',3);path([[30,-87],[40,-99]],'#7b7050',2);path([[41,-70],[49,-95],[58,-102]],'#7b7050',3);path([[49,-90],[40,-99]],'#7b7050',2);}else{curve([[40,-72],[22,-87],[24,-61],[36,-64]],'#716c50',3);}path([[-34,-34],[-45,-26],[-47,-16]],'#8b8160',3);ctx.restore();}
function fish(x,y,s,t,turtle=false){ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t)*.1);ctx.scale(s,s);if(turtle){ellipse(0,0,32,23,'#617f64');ellipse(37,0,12,9,'#829779');for(const sy of [-1,1])for(const sx of [-1,1])ellipse(sx*21,sy*22,13,6,'#748e70');path([[-13,-14],[13,-14],[23,0],[12,14],[-12,14],[-23,0],[-13,-14]],'#bec4a0',1);path([[0,-22],[0,22]],'#b1bd98',1);}else{ellipse(0,0,35,13,'#b99b68');path([[-24,0],[-52,-14+Math.sin(t*4)*5],[-48,14],[-24,0]],null,0,'#a58e62');curve([[-19,-4],[0,-14],[12,-14],[29,-2]],'#e0c797',2);path([[-7,4],[-18,23],[7,9]],null,0,'#9c916c');}ellipse(turtle?41:23,-3,2,2,ink);ctx.restore();}
function house(x,y,s,festive=false){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ellipse(0,3,105,15,'#44654d18');ctx.fillStyle='#d8ceb0';ctx.fillRect(-76,-105,152,105);ctx.fillStyle='#bcbaa1';ctx.fillRect(25,-105,51,105);path([[-96,-98],[-77,-111],[-15,-152],[10,-153],[78,-110],[101,-96]],'#43594c',3,'#576b59');curve([[-98,-98],[-28,-106],[33,-107],[101,-96]],'#88917a',4);for(let j=0;j<8;j++){const xx=-70+j*20;path([[xx*.6,-137],[xx,-104]],'#9a9f82',1);}ctx.fillStyle='#506050';ctx.fillRect(-19,-60,38,60);ctx.fillStyle='#e4c27d';ctx.fillRect(-58,-65,24,30);ctx.fillRect(36,-65,24,30);for(let i=0;i<3;i++){path([[-56+i*9,-65],[-56+i*9,-35]],'#707a5f',1);path([[38+i*9,-65],[38+i*9,-35]],'#707a5f',1);}path([[-64,-50],[-34,-50]],'#707a5f',1);path([[34,-50],[62,-50]],'#707a5f',1);if(festive){for(const xx of [-65,65]){path([[xx,-100],[xx,-75]],'#826e40',1);ellipse(xx,-69,12,17,'#b65037');path([[xx,-55],[xx,-44]],'#c4a55f',2);}curve([[-80,-101],[-40,-71],[40,-71],[80,-101]],'#ad523b',5);}ctx.restore();}
function field(t,harvest=false){bank(harvest?'#b7ac67':'#9ba96b');for(let row=0;row<8;row++){const y=710+row*24;curve([[350-row*70,y],[650,y-26],[1100,y+24],[1610,y-4]],harvest?'#d2c788':'#647d50',2);for(let i=0;i<38;i++){const x=350-row*70+i*34,hh=harvest?25:12;path([[x,y],[x+Math.sin(t*.8+i)*4,y-hh]],harvest?'#a8904e':'#698654',1);if(harvest){ellipse(x+3,y-hh,3,8,'#e2c477');}else path([[x,y-4],[x-6,y-10],[x,y-5],[x+6,y-12]],'#76935d',1);}}}
function bridge(){ctx.save();ctx.translate(860,660);ctx.beginPath();ctx.moveTo(-250,25);ctx.quadraticCurveTo(0,-170,250,25);ctx.lineTo(250,60);ctx.quadraticCurveTo(0,-95,-250,60);ctx.closePath();ctx.fillStyle='#8e9b81';ctx.fill();curve([[-260,22],[-95,-130],[95,-130],[260,22]],'#c7c9aa',6);for(let i=0;i<15;i++){const x=-240+i*34,y=-72+Math.pow(x/240,2)*90;path([[x,y],[x,y-30]],'#829279',5);}curve([[-248,-4],[-80,-159],[80,-159],[248,-4]],'#a6b297',5);ctx.restore();}
function village(t,city=false,festive=false){bank('#8d9f79');for(let i=0;i<7;i++)house(430+i*142,640-Math.sin(i)*28,.62,festive);if(city){for(let j=0;j<2;j++)for(let i=0;i<6;i++)house(510+i*145,725+j*65,.68,festive);path([[375,810],[375,640],[420,620],[420,775],[1405,775],[1405,620],[1450,638],[1450,810]],'#7b8972',2,'#acb398');for(let i=0;i<29;i++)ctx.fillRect(415+i*35,765,20,18);house(925,817,1.15,true);}else{house(935,768,1.3,festive);bridge();}tree(350,720,.7,'blossom',t);tree(1340,778,.8,'blossom',t);}
function scene(kind,t){
  if(!cache.has(kind)){
    const layer=document.createElement('canvas');layer.width=1600;layer.height=900;
    const display=ctx;ctx=layer.getContext('2d');background(kind);ctx=display;
    // Keep only the current background: memory remains bounded during scrubbing.
    cache.clear();cache.set(kind,layer);
  }
  ctx.drawImage(cache.get(kind),0,0);water(t,kind==='fish');
  for(let i=0;i<4;i++)bird(710+i*34+Math.sin(t*.1)*40,260+Math.sin(i*2)*15,7-i*.5,t+i);
  if(kind==='dawn'){tree(1460,817,1.03,'pine',t);tree(1357,736,.58,'pine',t);boat(t-20);}
  if(kind==='rain'){ctx.fillStyle='#627f751a';ctx.fillRect(0,0,1600,900);for(let i=0;i<135;i++){const x=(i*137+t*70)%1650,y=(i*73+t*200)%920;path([[x,y],[x-7,y+19]],'#617e6b55',1);}tree(1320,779,.9,'pine',t);}
  if(kind==='flowers'){bank();grasses(t,true);for(let j=0;j<8;j++){const x=610+j*71,y=758+Math.sin(j*3)*31,h=80+j%3*28;curve([[x,y],[x-26,y-50],[x+30,y-h+20],[x+9,y-h]],'#65804e',3);for(let i=0;i<5;i++){ctx.save();ctx.translate(x+9,y-h);ctx.rotate(i*1.256+t*.025);ellipse(0,-13,6,20,['#a85e50','#c88265','#d9a382'][j%3]);ctx.restore();}ellipse(x+9,y-h,5,5,'#ddbd77');}}
  if(kind==='forest'){bank();for(let i=0;i<9;i++)tree(400+i*126,690+i%3*38,.68+i%3*.1,'pine',t);for(let j=0;j<9;j++)ellipse(590+j%3*37,540+Math.floor(j/3)*26,7,8,'#bc7950');ellipse(1070,534,24,9,'#93825b');for(let i=0;i<5;i++)curve([[1048,530+i*2],[1055,543],[1080,545],[1096,528+i]],'#6d6749',1);bird(1070,513,12,t);grasses(t);}
  if(kind==='animals'){bank();tree(1270,723,.95,'blossom',t);animal(790,753,1.15,'sheep',t);animal(1000,754,1.3,'deer',t);animal(679,763,.7,'sheep',t+2);grasses(t);}
  if(kind==='fish'){ctx.fillStyle='#5d978a55';ctx.fillRect(0,575,1600,325);for(let i=0;i<6;i++)fish(440+i*136+Math.sin(t*.3+i)*50,670+Math.sin(t*.5+i)*55,.8+i%2*.4,t+i,i===5);for(let i=0;i<18;i++){const x=380+i*61;curve([[x,930],[x-28,850],[x+25+Math.sin(t+i)*9,805],[x,772+i%4*24]],'#48786677',3);}}
  if(kind==='river'){path([[730,550],[720,566],[950,632],[1100,712],[850,900]],'#e8ead077',6);tree(1370,786,.95,'pine',t);bird(890,585,18,t);}
  if(kind==='boat'){boat(t);tree(1400,790,1,'pine',t);}
  if(kind==='farm'){field(t);animal(824+Math.sin(t*.2)*15,767,1,'ox',t);person(1033,770,1.1,t,'#6a7658','walk');path([[781,748],[951,748],[986,774],[941,790]],'#736847',5);path([[953,746],[1018,709]],'#736847',4);tree(1390,686,.55,'pine',t);}
  if(kind==='harvest'){field(t,true);tree(1320,717,.9,'autumn',t);house(630,692,.72);person(958,781,1.2,t,'#a78959','write');for(let i=0;i<4;i++){ellipse(1080+i*45,790,22,9,'#8c845055');path([[1060+i*45,785],[1080+i*45,724],[1100+i*45,785]],'#ac9253',1,'#d4bf78');path([[1070+i*45,761],[1090+i*45,761]],'#897744',3);}}
  if(kind==='build'){bank('#dee5d6');tree(1290,750,.9,'winter',t);house(902,764,1.4);for(let i=0;i<7;i++){ctx.fillStyle=i%2?'#8b9a88':'#a6b1a0';ctx.fillRect(681+i%3*39,755-Math.floor(i/3)*21,36,19);}person(752,785,1.2,t,'#738577','write');for(let i=0;i<45;i++)ellipse((i*137+t*13)%1600,(i*89+t*19)%900,1.8,1.8,'#f4f3e5');}
  if(['home','family','father'].includes(kind)){bank();house(890,779,1.65,true);tree(1235,770,.95,'blossom',t);person(858,796,1.3,t,'#a06c58');person(918,798,kind==='home'?1.1:.66,t,'#b09b6c');if(kind==='father'){person(865,715,.5,t,'#bfab79');}grasses(t,true);}
  if(['write','culture'].includes(kind)){bank('#a8b18a');tree(1280,766,1,'blossom',t);house(680,674,.8);ctx.fillStyle='#8c805c';ctx.fillRect(820,723,264,17);ctx.fillRect(843,740,12,67);ctx.fillRect(1050,740,12,67);ctx.fillStyle='#eeead2';ctx.fillRect(865,714,167,11);person(929,711,1.35,t,'#6e7963','write');path([[960,663],[983,716]],ink,2);ellipse(1008,713,13,5,ink);if(kind==='culture'){for(let i=0;i<6;i++)path([[1090+i*9,730],[1095+i*9,650]],'#8f845c',4);}}
  if(kind==='music'){bank('#b4aa7f');tree(1320,721,.85,'autumn',t);path([[735,765],[735,604],[1085,604],[1085,765]],'#6e7451',8);for(let i=0;i<7;i++){const x=760+i*48,y=627;path([[x,604],[x,y]],'#988656',2);path([[x-12,y],[x+12,y],[x+19,y+42+i*4],[x-19,y+42+i*4]],'#7d8858',2,'#b0a264');ellipse(x,y+40+i*4,18,4,'#6b794e');}person(682,772,1.15,t,'#67755e','write');person(1148,778,1.12,t,'#a18b64');}
  if(['village','wedding','scholar','city'].includes(kind)){village(t,kind==='city',kind==='wedding');if(kind==='wedding'){for(let j=0;j<5;j++)person(770+j*53,824,1,t,j===2?'#b4553e':'#856f55');curve([[765,747],[850,760],[870,727],[986,748]],'#b64e38',4);}else person(1010,830,1.2,t,'#5c7466');}
  if(['dream','finale'].includes(kind)){bridge();boat(t);tree(405,800,1.35,'blossom',t);tree(1310,806,1.42,'blossom',t);tree(1220,692,.6,'blossom',t);for(let i=0;i<40;i++){const x=(i*79+t*11)%1600,y=(i*43+t*14)%900;ctx.save();ctx.translate(x,y);ctx.rotate(t*.4+i);ellipse(0,0,4,2,'#d69587aa');ctx.restore();}glow(930,530,300,'#ece3be44');}
  if(!paper){paper=document.createElement('canvas');paper.width=1600;paper.height=1000;const display=ctx;ctx=paper.getContext('2d');texture();ctx=display;}
  ctx.drawImage(paper,0,0);
}
let paper=null;

// The picture-to-line phase uses hand-authored silhouettes that share the same
// object features as each scene. Modern characters are clearly separated.
function pictograph(word,x,y,size,progress){
  ctx.save();ctx.translate(x,y);ctx.scale(size/100,size/100);ctx.strokeStyle=ink;ctx.lineWidth=3.8;ctx.lineCap='round';ctx.lineJoin='round';
  const stroke=p=>{const count=Math.max(2,Math.ceil(p.length*progress));path(p.slice(0,count),ink,3.8);};
  const round=(cx,cy,rx,ry)=>{ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,-Math.PI*.5,-Math.PI*.5+Math.PI*2*progress);ctx.stroke();};
  if(word==='日'){round(50,45,30,30);stroke([[33,45],[68,45]]);}
  else if(word==='山'){stroke([[15,32],[15,82],[85,82],[85,32]]);stroke([[50,12],[50,80]]);}
  else if(word==='云'){curve([[14,51],[65,8],[91,60],[48,64],[14,70],[24,31],[59,37]],ink,3.8);}
  else if(word==='雨'){stroke([[12,20],[88,20]]);stroke([[18,79],[18,35],[82,35],[82,79]]);for(let i=0;i<4;i++)stroke([[34+i%2*31,47+Math.floor(i/2)*20],[34+i%2*31,55+Math.floor(i/2)*20]]);}
  else if(['林','果','巢','鸟','花','草'].includes(word)){stroke([[50,15],[50,85]]);stroke([[15,80],[50,53],[85,80]]);stroke([[15,30],[50,50],[85,30]]);if(word==='林'){stroke([[17,55],[17,87]]);stroke([[83,55],[83,87]]);}if(word==='果')round(50,25,19,15);if(word==='花')for(let i=0;i<5;i++){const a=i*1.256;round(50+Math.cos(a)*17,21+Math.sin(a)*17,8,8);}if(word==='巢')stroke([[17,16],[28,35],[42,16],[54,35],[70,16],[83,35]]);if(word==='鸟'){round(55,27,19,14);stroke([[74,28],[88,32],[73,35]]);}}
  else if(['水','河'].includes(word)){curve([[50,6],[20,35],[78,55],[49,92]],ink,3.8);stroke([[20,20],[12,40],[28,57]]);stroke([[80,25],[89,47],[76,74]]);}
  else if(word==='人'){stroke([[48,12],[51,46],[19,89]]);stroke([[50,45],[83,87]]);}
  else if(word==='舟'){stroke([[50,6],[24,23],[22,72],[50,93],[77,73],[76,24],[50,6]]);stroke([[25,34],[74,34]]);stroke([[24,64],[74,64]]);stroke([[50,15],[50,80]]);}
  else if(['羊','鹿'].includes(word)){stroke([[50,28],[50,88]]);stroke([[20,49],[80,49]]);stroke([[25,66],[76,66]]);curve([[50,30],[13,30],[13,4],[28,9]],ink,3.8);curve([[50,30],[87,30],[87,4],[72,9]],ink,3.8);if(word==='鹿'){stroke([[48,71],[29,90]]);stroke([[53,71],[75,90]]);}}
  else if(['鱼','龟'].includes(word)){round(50,43,23,28);stroke([[50,16],[50,74],[26,93],[51,83],[78,93]]);stroke([[29,35],[72,35]]);stroke([[29,53],[72,53]]);if(word==='龟'){stroke([[29,24],[15,14]]);stroke([[72,24],[85,14]]);}}
  else{ // An object emblem for the human chapters, explicitly labelled 意象.
    if(['家','安','好','嫁','国','建'].includes(word)){stroke([[8,39],[50,10],[92,39]]);stroke([[20,39],[20,88],[80,88],[80,39]]);stroke([[41,88],[41,57],[60,57],[60,88]]);}
    else if(['文','书','画','士','爸'].includes(word)){round(50,20,9,9);stroke([[50,30],[50,63],[26,88]]);stroke([[50,63],[75,88]]);stroke([[18,40],[50,51],[83,40]]);}
    else if(word==='梦'){round(50,34,25,25);stroke([[12,85],[38,59],[53,81],[78,53],[93,86]]);}
    else{stroke([[50,10],[50,88]]);stroke([[15,25],[15,62],[85,62],[85,25]]);stroke([[27,30],[27,52]]);stroke([[72,30],[72,52]]);}
  }
  ctx.restore();
}
function glyphs(shot,local){
  const ratio=width/height, mobile=ratio<1.2, count=shot.glyph.length;
  const base=mobile?width*.10:width*.065, yy=mobile?height*.23:height*.31;
  const size=mobile?Math.min(width*.19,82):Math.min(width*.075,115);
  const phase=ease((local-.22)/.36), reveal=ease(local/.17);
  ctx.save();ctx.globalAlpha=reveal;
  for(let i=0;i<count;i++){
    const col=mobile&&count>2?i%2:i,row=mobile&&count>2?Math.floor(i/2):0;
    const x=base+col*size*1.12, y=yy+row*size*1.18;
    ctx.globalAlpha=reveal*(1-phase);pictograph(shot.glyph[i],x,y-size*.82,size,ease(local/.2));
    ctx.globalAlpha=reveal*phase;ctx.font=`${size}px "KaiTi", "STKaiti", "Songti SC", "SimSun", serif`;ctx.fillStyle=ink;ctx.textAlign='left';ctx.fillText(shot.glyph[i],x,y);
  }
  ctx.globalAlpha=reveal*.75;ctx.font=`${mobile?9:11}px "SimSun", serif`;ctx.fillStyle='#617667';ctx.fillText(phase>.6?'成 字':local>.15?'取 象 · 意象示意':'观 物',base+5,yy+(mobile&&count>2?size*1.18:0)+size*.38);
  ctx.restore();
}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  const shot=shots[shotAt(time)],local=clamp((time-shot.start)/(shot.end-shot.start));
  const human=['farm','harvest','build','home','family','write','culture','music','father'].includes(shot.kind);
  const framing=human&&width/height>1.2?1.2:1;
  const zoom=framing*(reduced?1:1+Math.sin(local*Math.PI)*.035);
  const scale=Math.max(width/1600,height/900)*zoom;
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(scale,scale);ctx.translate(-(human?880:800)-(reduced?0:Math.sin(local*Math.PI)*18),-(human&&framing>1?500:450));scene(shot.kind,time);ctx.restore();
  // A soft paper margin keeps lettering readable without a card covering the art.
  const veil=ctx.createLinearGradient(0,0,width*.64,0);veil.addColorStop(0,'#f1eeddb0');veil.addColorStop(.6,'#f1eedd55');veil.addColorStop(1,'#f1eedd00');ctx.fillStyle=veil;ctx.fillRect(0,0,width,height);
  glyphs(shot,started?local:.75);
  const transition=1-ease(Math.min(time-shot.start,shot.end-time)/1.1);
  if(time>0&&time<duration&&transition>.001){ctx.fillStyle=`rgba(242,239,222,${transition*.85})`;ctx.fillRect(0,0,width,height);}
}
function clockText(n){return `${Math.floor(n/60).toString().padStart(2,'0')}:${Math.floor(n%60).toString().padStart(2,'0')}`;}
function update(){
  const index=shotAt(time),shot=shots[index];
  $('seek').value=time;$('seek').setAttribute('aria-valuetext',`${Math.floor(time/60)}分${Math.floor(time%60)}秒，${shot.title}`);$('time').textContent=`${clockText(time)} / 05:31`;
  $('play').textContent=playing?'暂停':time>=duration?'重播':'播放';$('play').setAttribute('aria-label',$('play').textContent);
  $('start').hidden=started;$('end').hidden=time<duration;
  $('previous').disabled=time<=0;$('next').disabled=index===shots.length-1;
  if(index!==current){current=index;$('chapterNumber').textContent=`第 ${String(index+1).padStart(2,'0')} 景`;$('sceneLabel').textContent=shot.title;$('verse').textContent=shot.verse;$('now').textContent=[...shot.glyph].join(' · ');document.querySelectorAll('#chapters button').forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));}
  $('phase').textContent=playing?`${shot.title} · ${shot.verse}`:'观物 · 取象 · 成字';
}
function seek(value){time=clamp(Number(value)||0,0,duration);started=true;if(time>=duration)playing=false;last=0;needsDraw=true;audioReset();syncAudio();update();}
function toggle(){if(time>=duration)seek(0);started=true;playing=!playing;last=0;needsDraw=true;syncAudio();update();}
function resize(){const box=canvas.getBoundingClientRect();width=box.width;height=box.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);needsDraw=true;}
// Optional original pentatonic score. No media downloads or speech services.
let audioContext=null, master=null, sound=false, nextNote=0, voices=[];
function audioReset(){for(const v of voices){try{v.stop();}catch{}}voices=[];nextNote=0;}
function syncAudio(){if(master)master.gain.setTargetAtTime(sound&&playing&&!document.hidden ? .12 : 0,audioContext.currentTime,.08);if(audioContext&&sound&&playing)audioContext.resume().catch(()=>{sound=false;$('sound').textContent='声音不可用';$('sound').setAttribute('aria-pressed','false');});}
function music(){if(!audioContext||!sound||!playing||document.hidden)return;const now=audioContext.currentTime;if(now<nextNote)return;nextNote=now+.72/rate;const step=Math.floor(time/.72),melody=[0,2,4,2,1,0,3,2,0,4,3,1,2,0,1,3],notes=[261.63,293.66,329.63,392,440];const frequency=notes[melody[step%melody.length]]*(step%8===0?.5:1);for(let i=0;i<3;i++){const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.value=frequency*(i+1);gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.4/(i+1)**2,now+.015);gain.gain.exponentialRampToValueAtTime(.001,now+2.5);osc.connect(gain).connect(master);osc.start(now);osc.stop(now+2.6);voices.push(osc);osc.onended=()=>{osc.disconnect();gain.disconnect();voices=voices.filter(v=>v!==osc);};}}
$('sound').addEventListener('click',async()=>{try{if(!audioContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('unsupported');audioContext=new Audio();master=audioContext.createGain();master.gain.value=0;master.connect(audioContext.destination);}await audioContext.resume();sound=!sound;$('sound').textContent=`声音：${sound?'开':'关'}`;$('sound').setAttribute('aria-pressed',String(sound));syncAudio();}catch{$('sound').textContent='声音不可用';}});
$('start').addEventListener('click',toggle);$('play').addEventListener('click',toggle);
$('restart').addEventListener('click',()=>{seek(0);playing=false;toggle();});
$('seek').addEventListener('input',e=>seek(e.target.value));
$('previous').addEventListener('click',()=>{const i=shotAt(time);seek(shots[Math.max(0,i-1)].start+.05);});
$('next').addEventListener('click',()=>seek(shots[Math.min(shots.length-1,shotAt(time)+1)].start+.05));
$('speed').addEventListener('change',e=>{rate=Number(e.target.value);last=0;});
$('chaptersToggle').addEventListener('click',()=>{const open=$('chapters').hidden;$('chapters').hidden=!open;$('chaptersToggle').setAttribute('aria-expanded',String(open));});
shots.forEach((s,i)=>{const b=document.createElement('button');b.innerHTML=`<small>${String(i+1).padStart(2,'0')} / ${clockText(s.start)}</small>${s.glyph}`;b.setAttribute('aria-label',`${s.title}，${s.glyph}`);b.addEventListener('click',()=>{seek(s.start+2);$('chapters').hidden=true;$('chaptersToggle').setAttribute('aria-expanded','false');$('chaptersToggle').focus();});$('chapters').append(b);});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('cinema').requestFullscreen();}catch{$('fullscreen').textContent='全屏不可用';}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏':'全屏';resize();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,button,a,summary'))return;if(e.code==='Space'){e.preventDefault();toggle();}if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();seek(time+(e.code==='ArrowLeft'?-5:5));}});
document.addEventListener('visibilitychange',()=>{last=0;syncAudio();});
new ResizeObserver(resize).observe(canvas);
function frame(now){if(playing&&!document.hidden){if(last)time=Math.min(duration,time+(now-last)/1000*rate);last=now;needsDraw=true;if(time>=duration){playing=false;syncAudio();}update();music();}else last=0;if(needsDraw){render();needsDraw=false;}requestAnimationFrame(frame);}
resize();update();requestAnimationFrame(frame);
