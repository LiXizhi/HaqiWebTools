// Original Canvas artwork, in a 760 x 520 composition. All placement is fixed;
// animation is a function of time, so replay never consumes game RNG state.
const Paint = (() => {
  const TAU=Math.PI*2;
  const palettes={
    sun:['#142a43','#b26854','#f7c77d'],moon:['#071528','#203b58','#9ec5d8'],
    mountain:['#102e32','#3d6867','#adccad'],river:['#0d2b3d','#3b7983','#a4d7d0'],
    fire:['#100f20','#463348','#dd8650'],tree:['#102b2c','#45694e','#bfc98b'],
    stone:['#1d343e','#658482','#c6c2a3'],earth:['#28262d','#766448','#d7b879'],
    person:['#252a3b','#8e7063','#e3bb86'],voice:['#223141','#826c80','#e7b8aa'],
    hand:['#182e3b','#716d65','#dac4a5'],eye:['#071c2b','#254956','#87b5ba'],
    ear:['#1c233c','#54516f','#bcaec8'],heart:['#29182c','#74415b','#e8a3a5'],
    field:['#213d3a','#718354','#e4d69e'],kiteUp:['#163b56','#51869c','#c3dfd6'],
    kiteDown:['#202b48','#786f94','#e5bac0'],shelter:['#142c3a','#4c6571','#d3b899'],
    boat:['#10303b','#367c81','#b1d5c0'],bridge:['#142f3b','#687e78','#e2c9a0'],
    sky:['#123752','#569bb6','#d6e8d5'],cloud:['#1d526a','#83b4bb','#e9e3b9'],
    dance:['#21182e','#674366','#dda1b2'],
  };
  function path(c,points,color,width=2,fill=false){c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));if(fill){c.closePath();c.fillStyle=color;c.fill();}else{c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}}
  function oval(c,x,y,rx,ry,color,angle=0){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),angle,0,TAU);c.fillStyle=color;c.fill();}
  function glow(c,x,y,r,color){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,color.slice(0,7)+'00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
  function cloud(c,x,y,s,t,alpha=.6){c.save();c.translate(x,y);c.scale(s,s);c.globalAlpha*=alpha;for(let j=0;j<18;j++){const px=(j*43%157)-78,py=-Math.sin(j*2.9)*14;const g=c.createRadialGradient(px,py,1,px,py,43);g.addColorStop(0,'#fff7df70');g.addColorStop(1,'#e5f2ee00');c.fillStyle=g;c.fillRect(px-43,py-43,86,86);}c.restore();}
  function mountains(c,t,color,offset=0){for(let k=0;k<4;k++){const points=[[-1400,1000]];for(let x=-1400;x<=1400;x+=7){const y=90+k*35-Math.abs(Math.sin(x/170+k*.8))*80-Math.sin(x/47+k)*15-Math.sin(x/15+k)*3+offset;points.push([x,y]);}points.push([1400,1000]);path(c,points,color[k],0,true);}}
  function water(c,t,y=100){const g=c.createLinearGradient(0,y,0,410);g.addColorStop(0,'#5d969d35');g.addColorStop(1,'#092b44cc');c.fillStyle=g;c.fillRect(-1400,y,2800,1000-y);for(let i=0;i<140;i++){const yy=y+i*2.6;const x=Math.sin(i*43.5)*800, len=8+(i%7)*5;path(c,[[x,yy],[x+len+Math.sin(t+i)*6,yy]],i%4?'#b5d5cb25':'#e9e0b859',.5+(i%3)*.3);}}
  function reflection(c,t,x,y,color){for(let i=0;i<34;i++){const xx=x+Math.sin(i*2.7+t)*i*.7;path(c,[[xx-7-i*.8,y+i*3],[xx+7+i*.8,y+i*3]],color,(1-i/45)*2);}}
  function boat(c,x,y,s,t){c.save();c.translate(x,y+Math.sin(t)*2);c.scale(s,s);oval(c,0,17,55,6,'#061b2e66');path(c,[[-46,0],[43,0],[25,18],[-27,18]],'#653d32',0,true);path(c,[[-44,0],[42,0]],'#efcda0',2);path(c,[[0,0],[0,-71]],'#e3c59c',3);path(c,[[4,-68],[35,-9],[4,-9]],'#f9dfb5',0,true);for(let i=0;i<5;i++)path(c,[[5,-18-i*9],[29-i*5,-18-i*9]],'#b58b6366',1);c.restore();}
  function rock(c,x,y,s,color='#879896'){c.save();c.translate(x,y);c.scale(s,s);path(c,[[-65,14],[-53,-30],[-11,-51],[32,-36],[63,5],[42,23]],color,0,true);path(c,[[-53,-30],[-11,-51],[1,-6],[-65,14]],'#ffffff1c',0,true);path(c,[[1,-6],[32,-36],[63,5],[42,23]],'#05283840',0,true);path(c,[[-50,-29],[-13,-47],[0,-8],[37,-2]],'#f4e7b74d',1.5);for(let i=0;i<20;i++)oval(c,(i*29%90)-45,(i*11%35)-15,1+i%3,.6,'#dae5cd28');c.restore();}
  function tree(c,x,y,s,t,growth=1){c.save();c.translate(x,y);c.scale(s*growth,s*growth);function branch(len,depth,angle){c.save();c.rotate(angle);const bend=Math.sin(t*.5+depth)*.035;c.strokeStyle=depth>2?'#9b9972':'#c0b88d';c.lineWidth=Math.max(1,depth*1.8);c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(len*.1,-len*.45,0,-len);c.stroke();c.translate(0,-len);if(depth){branch(len*.71,depth-1,-.46+bend);branch(len*.72,depth-1,.44+bend);}else{for(let j=0;j<4;j++)oval(c,Math.sin(j*3)*10,-j*5,11,4,j%2?'#b9cb86':'#72a782',j*.8+t*.04);}c.restore();}branch(72,5,0);c.restore();}
  function person(c,x,y,s,t,color='#edc7a2',pose=0){c.save();c.translate(x,y);c.scale(s,s);oval(c,0,-77,10,12,'#e8c7a9');path(c,[[-7,-88],[5,-90],[11,-82],[7,-80],[-9,-80]],'#25303b',0,true);path(c,[[0,-62],[-10,-31],[12,-31],[4,-63]],color,0,true);path(c,[[-4,-31],[-12+Math.sin(t)*pose,0]],'#252e3b',6);path(c,[[7,-31],[15-Math.sin(t)*pose,0]],'#252e3b',6);path(c,[[-2,-59],[-21,-44-pose]],color,5);path(c,[[5,-59],[25,-44-pose]],color,5);c.restore();}
  function birds(c,t,n=4){for(let i=0;i<n;i++){const x=-240+i*120+Math.sin(t*.13+i)*35,y=-120+Math.sin(i*4)*35,flap=Math.sin(t*3+i)*4;path(c,[[x-8,y+flap],[x,y],[x+8,y+flap]],'#e5e8d288',1.2);}}
  function leaf(c,x,y,s,angle,color='#d8bf75'){c.save();c.translate(x,y);c.rotate(angle);c.scale(s,s);c.beginPath();c.moveTo(-22,0);c.bezierCurveTo(-8,-21,17,-15,27,0);c.bezierCurveTo(10,12,-12,12,-22,0);c.fillStyle=color;c.fill();path(c,[[-22,0],[25,0]],'#fff3c688',1);for(let i=0;i<5;i++)path(c,[[-12+i*7,0],[-8+i*7,-7]],'#fff3c644',.7);c.restore();}
  function hand(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);c.beginPath();c.moveTo(-82,90);c.bezierCurveTo(-60,51,-91,4,-67,-4);c.bezierCurveTo(-55,-7,-48,20,-34,28);c.lineTo(-39,-68);c.quadraticCurveTo(-35,-90,-23,-72);c.lineTo(-13,6);c.lineTo(-8,-95);c.quadraticCurveTo(1,-115,11,-94);c.lineTo(12,6);c.lineTo(25,-80);c.quadraticCurveTo(36,-95,41,-75);c.lineTo(34,13);c.lineTo(53,-47);c.quadraticCurveTo(69,-65,70,-43);c.lineTo(53,51);c.quadraticCurveTo(43,79,37,99);c.closePath();const g=c.createLinearGradient(-80,-100,60,100);g.addColorStop(0,'#fae2b6');g.addColorStop(.5,'#d6a27b');g.addColorStop(1,'#996359');c.fillStyle=g;c.fill();path(c,[[-32,32],[-10,49],[24,46]],'#925c5455',2);path(c,[[-16,77],[-5,59],[2,28]],'#925c5455',2);c.restore();}
  function heart(c,x,y,s,color){c.save();c.translate(x,y);c.scale(s,s);c.beginPath();c.moveTo(0,60);c.bezierCurveTo(-100,0,-64,-75,0,-27);c.bezierCurveTo(64,-75,100,0,0,60);c.fillStyle=color;c.fill();c.restore();}
  function kite(c,x,y,s,t){c.save();c.translate(x,y);c.rotate(Math.sin(t*.6)*.08);c.scale(s,s);path(c,[[0,-56],[42,0],[0,55],[-42,0]],'#d9976b',0,true);path(c,[[0,-56],[0,55],[-42,0]],'#edd4a0',0,true);path(c,[[0,-56],[0,55]],'#614b4b',1);path(c,[[-42,0],[42,0]],'#614b4b',1);const tail=[];for(let i=0;i<30;i++)tail.push([Math.sin(i*.3-t)*i*.4,55+i*4]);path(c,tail,'#f6cd9c',1.5);for(let i=2;i<7;i++)leaf(c,Math.sin(i*1.2-t)*i*1.6,55+i*15,.23,i*.4,'#c98070');c.restore();}
  function lantern(c,x,y,s,color='#f2bb78'){c.save();c.translate(x,y);c.scale(s,s);glow(c,0,0,78,color+'28');oval(c,0,0,24,32,color);for(let i=-2;i<=2;i++){c.beginPath();c.ellipse(0,0,Math.max(2,Math.abs(i)*10),32,0,0,TAU);c.strokeStyle='#8d4e5d66';c.lineWidth=1;c.stroke();}path(c,[[-14,-30],[14,-30]],'#9d7159',5);path(c,[[-14,30],[14,30]],'#9d7159',5);path(c,[[0,33],[0,54]],'#e2af76',2);c.restore();}
  function garden(c,t,q){for(let i=0;i<7;i++){const x=-180+i*60,y=150+Math.sin(i*3)*10;const bend=(1-q)*16+Math.sin(t+i)*3;path(c,[[x,y],[x+bend,y-38]],'#87a67c',2);leaf(c,x+7,y-12,.5,-.6,'#89ac80');for(let k=0;k<6;k++)oval(c,x+bend+Math.cos(k*TAU/6)*7,y-40+Math.sin(k*TAU/6)*7,6,4,i%2?'#eac894':'#dfadb1',k);oval(c,x+bend,y-40,4,4,'#ffe2a0');}}
  function draw(c,story,t,q){
    const theme=story.theme,p=palettes[theme];
    const bg=c.createLinearGradient(0,-360,0,350);bg.addColorStop(0,p[0]);bg.addColorStop(.6,p[1]);bg.addColorStop(1,p[0]);c.fillStyle=bg;c.fillRect(-900,-600,1800,1200);
    glow(c,110,-140,340,p[2]+'25');
    for(let i=0;i<60;i++){const x=(i*137%850)-425,y=(i*79%290)-300;oval(c,x,y,.5+(i%3)*.35,.5+(i%3)*.35,p[2]+(i%3?'40':'80'));}
    mountains(c,t,[p[0]+'30',p[0]+'55',p[0]+'77',p[0]+'aa']);
    // Distinct foreground paintings. Energy q is changed by the learner.
    if(theme==='sun'||theme==='moon'){
      const moon=theme==='moon',x=moon?50:-45,y=moon?-95:90-q*200;
      glow(c,x,y,180,moon?'#c3e7fb45':'#ffc87266');oval(c,x,y,moon?67:60,moon?67:60,moon?'#eff0d4':'#ffd29a');
      if(moon){oval(c,x+29,y-20,58,58,p[0]);for(let i=0;i<18;i++)oval(c,x-40+(i*17%35),y-25+(i*13%50),1+i%3,1+i%3,'#b5c6c12a');}
      else for(let i=0;i<14;i++){c.save();c.translate(x,y);c.rotate(i*TAU/14+t*.008);const g=c.createLinearGradient(0,40,0,260);g.addColorStop(0,'#ffdc9e13');g.addColorStop(1,'#ffdc9e00');path(c,[[-5,45],[5,45],[40,260],[-40,260]],g,0,true);c.restore();}
      mountains(c,t,['#22404a20','#253b4f66','#233c4f','#152d41'],40);water(c,t,123);reflection(c,t,x,128,moon?'#d6e6d67a':'#fbd3978a');boat(c,-150+q*120,190,.7,t);cloud(c,-180,-40,1,t,.35);cloud(c,190,-120,.9,t,.3);
    }else if(theme==='mountain'){
      for(let k=0;k<3;k++){const x=(k-1)*165,y=k===1?-175:-65;path(c,[[x-160,180],[x-70,y+75],[x,y],[x+65,y+105],[x+150,180]],['#386868','#60847b','#335a60'][k],0,true);path(c,[[x,y],[x-18,y+61],[x+24,y+48],[x+65,y+105]],'#cdd7b781',0,true);for(let j=0;j<18;j++)path(c,[[x+j*4-15,y+75+j*3],[x+j*7-35,170]],'#123c3e20',1);}
      for(let k=0;k<5;k++)cloud(c,-240+k*120+Math.sin(t*.2+k)*15,20+k%2*55,1.8,t,.85-q*.75);tree(c,-263,210,.5,t);birds(c,t);
    }else if(theme==='river'){
      c.beginPath();c.moveTo(-70,-50);c.bezierCurveTo(120,10,-180,65,-20,140);c.bezierCurveTo(140,210,70,210,230,300);c.lineTo(-220,300);c.bezierCurveTo(-250,150,60,120,-100,50);c.bezierCurveTo(-180,5,-20,-30,-70,-50);c.fillStyle='#79bac2';c.fill();
      for(let i=0;i<85;i++){const yy=-40+(i*13+t*(15+q*30))%340,x=Math.sin(yy/48)*70;path(c,[[x-20,yy],[x+15,yy+2]],'#e8f1ce55',1);}
      rock(c,130,130,1);rock(c,-170,210,.8);tree(c,-200,60,.5,t);for(let i=0;i<8;i++)leaf(c,Math.sin(i*8)*200,170+i*8,.3,t*.2+i,'#abc18c');
    }else if(theme==='fire'){
      c.fillStyle='#111827';c.fillRect(-210,-185,420,390);c.strokeStyle='#82705a';c.lineWidth=7;c.strokeRect(-166,-145,332,280);path(c,[[0,-145],[0,135]],'#82705a',7);path(c,[[-166,-20],[166,-20]],'#82705a',7);
      glow(c,0,35,230,'#ffad5145');path(c,[[-60,155],[55,130]],'#86604e',15);path(c,[[-50,130],[50,157]],'#ad7951',11);
      for(let k=0;k<5;k++){const size=.35+q*.65;c.save();c.translate(0,135);c.scale(size,size);c.beginPath();c.moveTo(-45+k*9,0);c.bezierCurveTo(-105+k*16,-65,35,-85,-10+Math.sin(t*2+k)*15,-190+k*24);c.bezierCurveTo(70-k*8,-75,70-k*8,-5,0,8);c.fillStyle=['#b74c3d','#d5673f','#f39b4e','#ffd37c','#fff0b9'][k];c.fill();c.restore();}for(let i=0;i<20;i++){const yy=120-(i*31+t*32)%260;oval(c,Math.sin(i*11+yy/65)*40,yy,1.2,2,'#ffcd8866');}
    }else if(theme==='tree'){
      oval(c,0,175,210,30,'#0a292c88');for(let i=0;i<8;i++)path(c,[[0,150],[Math.sin(i*7)*80,182],[Math.sin(i*7)*110,188]],'#bca77b',2);tree(c,0,160,1.25,t,.25+q*.75);for(let i=0;i<12;i++)leaf(c,-230+i*40,195+Math.sin(i)*12,.3,i,'#b6ca87');
    }else if(theme==='stone'){
      water(c,t,20);for(let i=0;i<5;i++){rock(c,-220+i*110,160-i%2*45,.65+q*.25,['#7c8e8c','#b0b8a4','#819996'][i%3]);reflection(c,t,-220+i*110,185-i%2*45,'#e2d7ab22');}person(c,-250+q*460,95,.65,t,'#d7b487',3);tree(c,290,80,.6,t);
    }else if(theme==='earth'){
      path(c,[[-330,105],[330,105],[300,220],[-300,220]],'#96754e',0,true);for(let i=0;i<130;i++)oval(c,(i*79%600)-300,110+(i*31%100),1+i%3,1,'#e1bb7338');path(c,[[0,170],[0,85-q*130]],'#8eab6c',5);leaf(c,-17,100-q*105,.3+q,-.5,'#bad68b');leaf(c,22,87-q*108,.3+q,.4,'#93bd83');for(let i=0;i<5;i++)path(c,[[0,169],[Math.sin(i)*40,192],[Math.sin(i)*55,212]],'#e0c697',1.5);glow(c,0,50,140,'#daca7f22');
    }else if(theme==='person'){
      path(c,[[-340,210],[-100,125],[60,120],[340,50]],'#ceb08766',35);person(c,-140+q*100,140,1.5,t,'#d7a277',8);person(c,160-q*100,133,1.35,t+2,'#9dbdb2',8);tree(c,-270,120,.65,t);birds(c,t,3);
    }else if(theme==='voice'){
      person(c,-190,155,1.35,t,'#e9baa0',0);person(c,230,50,.7,t,'#b9cdb8',0);for(let i=0;i<5;i++){const r=25+((t*22+i*43)%220);c.beginPath();c.arc(-170,55,r,-.65,.35);c.strokeStyle=`rgba(244,208,174,${q*(1-r/260)*.55})`;c.lineWidth=2;c.stroke();}glow(c,-175,45,65,'#f1c79c22');
    }else if(theme==='hand'){
      water(c,t,150);hand(c,0,80,1.2);leaf(c,0,-155+q*160,1.1,Math.sin(t)*.25,'#e9c47b');for(let i=0;i<6;i++)leaf(c,-260+i*100,90+Math.sin(t*.4+i)*80,.3,t*.3+i,'#d2bb7e');
    }else if(theme==='eye'){
      glow(c,0,-20,210,'#a4dce52c');c.save();c.translate(0,-20);c.scale(1,.35+q*.65);c.beginPath();c.moveTo(-170,0);c.bezierCurveTo(-75,-108,75,-108,170,0);c.bezierCurveTo(75,100,-75,100,-170,0);c.fillStyle='#d8e1cc';c.fill();const g=c.createRadialGradient(0,0,10,0,0,67);g.addColorStop(0,'#0c2532');g.addColorStop(.45,'#467f87');g.addColorStop(1,'#193b4d');oval(c,0,0,65,65,g);for(let i=0;i<42;i++){const a=i*TAU/42;path(c,[[Math.cos(a)*31,Math.sin(a)*31],[Math.cos(a+.08)*59,Math.sin(a+.08)*59]],'#a2c9bd65',1);}oval(c,0,0,26,30,'#081e29');oval(c,-16,-21,13,9,'#fff6db');c.restore();for(let i=0;i<18;i++){const x=Math.sin(i*37+t*.2)*280,y=120+Math.sin(i*11+t*.4)*55;glow(c,x,y,15,'#c9e79933');oval(c,x,y,1.5,1.5,'#eff4b6');}
    }else if(theme==='ear'){
      for(let i=0;i<7;i++){const x=-300+i*100;path(c,[[x,250],[x+Math.sin(t+i)*5,-230]],'#71918a55',6);for(let j=0;j<8;j++){path(c,[[x-5,-210+j*60],[x+5,-210+j*60]],'#a6b6a477',2);leaf(c,x+16,-195+j*60,.8,-.5,'#738f8a88');}}
      c.save();c.translate(-30,0);c.beginPath();c.moveTo(5,95);c.bezierCurveTo(-50,100,-25,45,-55,0);c.bezierCurveTo(-120,-145,110,-170,75,-15);c.bezierCurveTo(63,45,28,26,5,95);c.strokeStyle='#e3c4ad';c.lineWidth=15;c.lineCap='round';c.stroke();c.beginPath();c.moveTo(4,54);c.bezierCurveTo(-20,15,56,4,26,-64);c.bezierCurveTo(9,-92,-38,-76,-34,-30);c.strokeStyle='#c59c94';c.lineWidth=8;c.stroke();c.restore();c.save();c.translate(180,-140);c.rotate(Math.sin(t*2)*q*.15);path(c,[[0,-90],[0,0]],'#ddc491',1);lantern(c,0,20,.5,'#ccb9b7');path(c,[[0,47],[0,90]],'#ddc491',1);path(c,[[-8,90],[9,90],[9,138],[-8,138]],'#eadcc2',0,true);c.restore();
    }else if(theme==='heart'){
      glow(c,0,0,240,'#f3a1b530');c.save();c.translate(0,90);c.rotate(-.08);path(c,[[-120,-60],[120,-60],[120,70],[-120,70]],'#e6cbb6',0,true);path(c,[[-120,-60],[0,30],[120,-60]],'#c6a496',2);path(c,[[-120,70],[0,-10],[120,70]],'#c6a496',1);c.restore();const scale=.35+q*.65;heart(c,0,-35,scale*(1+Math.sin(t*2)*.035),'#dd8e9f');heart(c,-15,-48,scale*.5,'#efb2b8');for(let i=0;i<12;i++)glow(c,Math.sin(i*4+t*.1)*200,Math.cos(i*3+t*.2)*140,4,'#eab7a866');
    }else if(theme==='field'){
      c.save();c.translate(0,40);c.scale(1,.66);c.rotate(Math.PI/4);for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=-155+i*165,y=-155+j*165;c.fillStyle=(i+j)%2?'#758c55':'#8c9f63';c.fillRect(x,y,145,145);for(let n=0;n<36;n++){const xx=x+12+(n%6)*23,yy=y+12+Math.floor(n/6)*23;path(c,[[xx,yy],[xx-4,yy-9*q]],'#d7de9c',2);path(c,[[xx,yy],[xx+4,yy-12*q]],'#bbd18c',2);}}path(c,[[-170,0],[170,0]],'#e3cf93',10);path(c,[[0,-170],[0,170]],'#e3cf93',10);c.strokeStyle='#e3cf93';c.lineWidth=9;c.strokeRect(-165,-165,330,330);c.restore();person(c,210,130,.8,t,'#c8b080');birds(c,t,2);
    }else if(theme==='kiteUp'||theme==='kiteDown'){
      const up=theme==='kiteUp',y=up?100-q*245:-145+q*245;cloud(c,-170,-140,1.4,t);cloud(c,210,-60,1.2,t);tree(c,-235,200,.75,t);kite(c,30+Math.sin(t*.5)*15,y,.9,t);person(c,120,210,.8,t,'#e7bc98',15);path(c,[[30,y+48],[70,y+100],[120,164]],'#e9debd99',1);
    }else if(theme==='shelter'){
      for(let i=0;i<90;i++){const x=(i*73)%800-400,y=(i*37+t*110)%560-280;if(Math.abs(x)<(70+q*110)&&y>0)continue;path(c,[[x,y],[x-4,y+15]],'#b3cfdb45',1);}person(c,-42,185,1.15,t,'#d1ac86');person(c,150-q*100,185,1.05,t,'#9abeb4');c.save();c.translate(0,40);const s=.6+q*.6;c.scale(s,s);c.beginPath();c.moveTo(-160,0);c.bezierCurveTo(-100,-140,100,-140,160,0);c.quadraticCurveTo(120,-26,80,0);c.quadraticCurveTo(40,-26,0,0);c.quadraticCurveTo(-40,-26,-80,0);c.quadraticCurveTo(-120,-26,-160,0);c.fillStyle='#d4a16e';c.fill();for(let i=-1;i<=1;i++)path(c,[[0,-105],[i*80,0]],'#f4d6a580',1.5);path(c,[[0,-110],[0,100],[15,115],[30,102]],'#e6ca9e',4);c.restore();
    }else if(theme==='boat'){
      water(c,t,-20);rock(c,-155,120,1.6);rock(c,155,120,1.6);boat(c,0,170-q*150,.7-q*.25,t);reflection(c,t,0,190-q*150,'#e0dbb733');cloud(c,-130,-130,1.3,t);
    }else if(theme==='bridge'){
      water(c,t,95);c.beginPath();c.moveTo(-260,190);c.bezierCurveTo(-180,-80,180,-80,260,190);c.strokeStyle='#acaa8a';c.lineWidth=33;c.stroke();c.beginPath();c.moveTo(-260,150);c.bezierCurveTo(-180,-120,180,-120,260,150);c.strokeStyle='#dfcc9e';c.lineWidth=5;c.stroke();for(let i=0;i<13;i++){const x=-240+i*40,y=-46+x*x/260;path(c,[[x,y],[x,y+35]],'#d6c598',4);}const x=210*(1-q)+18,y=-15+x*x/260;person(c,-x,y,.75,t,'#e4b68c',5);person(c,x,y,.75,t,'#a0c1b6',5);glow(c,0,-5,80,'#f1d59a25');
    }else if(theme==='sky'){
      glow(c,0,-130,190,'#b6e6ff55');for(let i=0;i<6;i++)cloud(c,(i-2.5)*(75+q*60),-95+i%2*65,1.7,t,.85);person(c,0,205,.9,t,'#e4d2a6',20);birds(c,t,5);path(c,[[-360,260],[-360,70],[-250,70],[-250,230]],'#213d4c',20);path(c,[[360,260],[360,70],[250,70],[250,230]],'#213d4c',20);
    }else if(theme==='cloud'){
      glow(c,170,-145,150,'#ffe6a261');oval(c,170,-145,47,47,'#ffe1a0');cloud(c,-270+q*300,-95,2.8,t,.95);oval(c,0,153,220,32,'#173e4544');garden(c,t,q);
    }else if(theme==='dance'){
      oval(c,0,200,270,45,'#e8b8aa17');for(let i=0;i<5;i++)lantern(c,-280+i*140,-145+Math.sin(i*2)*25,.6,'#e9b696');
      for(let k=0;k<3;k++){const x=(k-1)*145,s=k===1?1.4:1.05,phase=t*1.7+k*2;person(c,x,170+Math.sin(phase)*q*7,s,phase,k===1?'#e6a0ad':'#b7cfc2',15+q*15);for(let side of [-1,1]){const points=[];for(let i=0;i<50;i++)points.push([x+side*(30+i*1.4),80+Math.sin(i*.12-phase)*35*q+i*.7]);path(c,points,k===1?'#f2bf9c99':'#bbbce199',5);}}
    }
    // Foreground grasses, airborne seeds and etched edges provide depth without
    // raster textures or a network dependency.
    for(let i=0;i<36;i++){const x=-400+(i*47%800),y=230+i%4*8;path(c,[[x,y],[x+Math.sin(t*.4+i)*3,y-10-i%5*5]],p[2]+'35',1);}
    for(let i=0;i<20;i++){const x=Math.sin(i*97+t*.06)*350,y=Math.sin(i*61+t*.09)*210;oval(c,x,y,.6+i%2,.6+i%2,p[2]+'60');}
  }
  return {draw,path,oval,glow,palettes};
})();
