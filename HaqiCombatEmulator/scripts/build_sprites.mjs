#!/usr/bin/env node
// Deterministic pixel-art sprite sheet generator for Haqi.html. Development-only; the browser
// loads the committed PNGs under assets/sprites/. Sheet layout: rows = down, up, left, right;
// columns = 4 walk frames (column 0 doubles as idle). No dependencies: PNG is encoded with zlib.
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';
const OUT=path.resolve(new URL('../assets/sprites/',import.meta.url).pathname);
fs.mkdirSync(OUT,{recursive:true});
const CRC=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}return buf=>{let c=-1;for(const b of buf)c=t[(c^b)&255]^(c>>>8);return (c^-1)>>>0;};})();
function chunk(type,data){const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type,'ascii'),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(CRC(body));return Buffer.concat([len,body,crc]);}
function encodePNG(width,height,rgba){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;ihdr[10]=0;ihdr[11]=0;ihdr[12]=0;
  const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++){raw[y*(width*4+1)]=0;rgba.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);}
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const hex=h=>{const n=parseInt(h.slice(1),16);return [n>>16&255,n>>8&255,n&255,255];};
class Canvas{constructor(w,h){this.w=w;this.h=h;this.d=Buffer.alloc(w*h*4);}
  set(x,y,c){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=this.w||y>=this.h||!c)return;const i=(y*this.w+x)*4;const [r,g,b,a]=typeof c==='string'?hex(c):c;this.d[i]=r;this.d[i+1]=g;this.d[i+2]=b;this.d[i+3]=a;}
  rect(x,y,w,h,c){for(let j=0;j<h;j++)for(let i=0;i<w;i++)this.set(x+i,y+j,c);}
  disc(cx,cy,r,c){for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r+r*.5)this.set(cx+x,cy+y,c);}
  ellipse(cx,cy,rx,ry,c){for(let y=-ry;y<=ry;y++)for(let x=-rx;x<=rx;x++)if((x*x)/(rx*rx+.01)+(y*y)/(ry*ry+.01)<=1.05)this.set(cx+x,cy+y,c);}
  blit(src,dx,dy,mirror=false){for(let y=0;y<src.h;y++)for(let x=0;x<src.w;x++){const i=(y*src.w+x)*4;if(src.d[i+3])this.set(dx+(mirror?src.w-1-x:x),dy+y,[src.d[i],src.d[i+1],src.d[i+2],src.d[i+3]]);}}
  outline(c){const copy=Buffer.from(this.d);for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){const i=(y*this.w+x)*4;if(copy[i+3])continue;let near=false;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=this.w||ny>=this.h)continue;if(copy[(ny*this.w+nx)*4+3]){near=true;break;}}if(near)this.set(x,y,c);}}}
const shade=(h,k)=>{const [r,g,b]=hex(h);const f=x=>Math.max(0,Math.min(255,Math.round(x*k)));return [f(r),f(g),f(b),255];};
const SCHOOL={fire:{robe:'#d9502f',trim:'#f4b66c'},ice:{robe:'#3d8fd6',trim:'#bfe9ff'},storm:{robe:'#7b56c9',trim:'#e0c9ff'},death:{robe:'#3f7d6a',trim:'#a8e0c4'},life:{robe:'#d8a53c',trim:'#fff2b8'}};
const SKIN='#f4d3a8',SKIN_DARK='#d9a878';
// ---------------------------------------------------------------- humanoid 24x32
function humanoid(frame,dir,{robe,trim,hair,long=false,hat=null,skin=SKIN}) {
  const c=new Canvas(24,32);const bob=frame%2===1?1:0;const legA=[0,2,0,-2][frame],legB=-legA;
  const facing=dir==='left'||dir==='right';
  // legs
  c.rect(8,26+bob,3,5-bob,'#4a3b32');c.rect(13,26+bob,3,5-bob,'#4a3b32');
  if(facing){c.rect(9+legA,26+bob,3,5-bob,'#4a3b32');c.rect(12+legB,26+bob,3,5-bob,'#4a3b32');}
  else{c.rect(8,26+bob+Math.max(0,legA),3,5-bob-Math.max(0,legA),'#4a3b32');c.rect(13,26+bob+Math.max(0,legB),3,5-bob-Math.max(0,legB),'#4a3b32');}
  c.rect(8,30,3,2,'#2b2420');c.rect(13,30,3,2,'#2b2420');
  // robe body
  c.rect(6,15+bob,12,12,robe);c.rect(5,20+bob,14,7,robe);c.rect(6,26+bob,12,1,shade(robe,.7));
  c.rect(7,15+bob,10,1,trim);c.rect(11,16+bob,2,10,trim);
  // arms
  const swing=facing?legA:0;
  c.rect(4,16+bob+swing/2,2,8,robe);c.rect(18,16+bob-swing/2,2,8,robe);c.rect(4,24+bob+swing/2,2,2,skin);c.rect(18,24+bob-swing/2,2,2,skin);
  // head
  c.rect(7,5+bob,10,10,skin);c.rect(6,7+bob,1,6,skin);c.rect(17,7+bob,1,6,skin);
  if(dir==='down'){c.rect(9,10+bob,2,2,'#2a2f3a');c.rect(13,10+bob,2,2,'#2a2f3a');c.rect(11,13+bob,2,1,SKIN_DARK);}
  else if(facing){c.rect(dir==='left'?8:14,10+bob,2,2,'#2a2f3a');}
  // hair
  c.rect(6,3+bob,12,4,hair);c.rect(5,5+bob,2,4,hair);c.rect(17,5+bob,2,4,hair);
  if(dir==='up'){c.rect(6,6+bob,12,6,hair);}
  if(long){c.rect(5,8+bob,2,8,hair);c.rect(17,8+bob,2,8,hair);if(dir==='up')c.rect(6,11+bob,12,6,hair);}
  if(hat){c.rect(5,2+bob,14,3,hat);c.rect(8,-1+bob,8,4,hat);c.rect(10,-3+bob,4,3,hat);c.rect(5,4+bob,14,1,trim);}
  c.outline('#1b1a22');
  return c;
}
// ---------------------------------------------------------------- mobs 32x32
function mob(frame,dir,spec) {
  const c=new Canvas(32,32);const bob=frame%2===1?1:0;const step=[0,1,0,-1][frame];const facing=dir==='left'||dir==='right';
  const eye=(x,y)=>{if(dir!=='up'){c.rect(x,y,2,2,'#1a1a24');c.set(x,y,'#ffffff');}};
  const {base,dark,light,accent}=spec;
  if(spec.shape==='blob'){c.ellipse(16,20-bob,10,8+bob,base);c.ellipse(13,16-bob,4,3,light);c.ellipse(16,27,9,2,dark);eye(11,18-bob);eye(19,18-bob);if(dir!=='up')c.rect(14,23-bob,4,1,dark);for(let i=0;i<3;i++)c.disc(8+i*8,9-bob-(i%2)*2,1,light);}
  if(spec.shape==='tree'){c.rect(13,20+bob,6,11-bob,dark);c.rect(11,29,3,3,dark);c.rect(18,29,3,3,dark);c.disc(16,13-bob,9,base);c.disc(11,15-bob,5,base);c.disc(21,15-bob,5,base);c.disc(13,9-bob,4,light);eye(12,17-bob);eye(18,17-bob);if(dir!=='up')c.rect(14,21+bob,4,1,'#1a1a24');c.rect(6+step,18-bob,4,2,dark);c.rect(22-step,18-bob,4,2,dark);}
  if(spec.shape==='cat'){c.ellipse(16,22-bob,8,7,base);c.disc(16,12-bob,7,base);c.rect(10,5-bob,3,4,base);c.rect(19,5-bob,3,4,base);c.set(11,6-bob,accent);c.set(20,6-bob,accent);c.ellipse(16,24-bob,4,3,light);eye(12,11-bob);eye(18,11-bob);if(dir!=='up'){c.rect(15,14-bob,2,1,accent);c.rect(13,15-bob,6,1,dark);}c.rect(9-step,15-bob-Math.abs(step)*2,3,6,base);c.rect(21,26-bob,3,4,base);c.rect(9,27,4,4,base);c.rect(19,27,4,4,base);c.rect(24,20-bob,5,2,base);c.rect(27,16-bob,2,5,base);c.rect(12,20-bob,8,4,accent);c.rect(14,21-bob,4,2,light);}
  if(spec.shape==='ogre'){c.rect(9,10-bob,14,13,base);c.rect(7,12-bob,2,9,base);c.rect(23,12-bob,2,9,base);c.rect(4+step,14-bob,4,10,base);c.rect(24-step,14-bob,4,10,base);c.rect(4+step,23-bob,4,2,dark);c.rect(24-step,23-bob,4,2,dark);c.rect(10,23,5,7,dark);c.rect(17,23,5,7,dark);c.rect(9,29+Math.max(0,step),6,3,'#2a2222');c.rect(17,29+Math.max(0,-step),6,3,'#2a2222');c.rect(11,4-bob,10,8,light);for(let i=0;i<5;i++){c.rect(9+i*3,1-bob-(i%2),2,4,accent);}eye(12,7-bob);eye(18,7-bob);if(dir!=='up'){c.rect(13,10-bob,6,1,'#1a1a24');c.set(13,9-bob,'#ffffff');c.set(18,9-bob,'#ffffff');}c.rect(11,16-bob,10,2,dark);}
  if(spec.shape==='fruit'){c.ellipse(16,18-bob,8,9,base);c.ellipse(13,14-bob,3,4,light);for(let i=0;i<6;i++)c.set(11+(i*7)%12,14+(i*5)%9-bob,dark);c.rect(15,6-bob,2,4,'#3a7a2a');c.rect(12,5-bob,4,2,'#5db54a');c.rect(16,4-bob,5,2,'#5db54a');eye(12,17-bob);eye(18,17-bob);if(dir!=='up')c.rect(14,21-bob,4,1,dark);c.rect(11+step,27,3,4,dark);c.rect(18-step,27,3,4,dark);c.rect(6+step,20-bob,3,2,dark);c.rect(23-step,20-bob,3,2,dark);}
  if(spec.shape==='bee'){c.ellipse(16,18-bob,7,5,base);c.rect(11,15-bob,10,1,dark);c.rect(11,19-bob,10,1,dark);c.disc(9,16-bob,3,base);eye(7,15-bob);c.ellipse(15,11-bob-(frame%2),6,2,[255,255,255,170]);c.ellipse(19,11-bob-(frame%2),6,2,[255,255,255,170]);c.rect(23,18-bob,3,1,dark);c.set(26,18-bob,'#1a1a24');}
  if(spec.shape==='ghost'){c.ellipse(16,14-bob,8,8,base);c.rect(8,14-bob,16,9,base);for(let i=0;i<4;i++)c.rect(8+i*4,23-bob+(i%2)*2,4,2,base);eye(12,12-bob);eye(18,12-bob);if(dir!=='up')c.ellipse(16,17-bob,2,1,dark);c.ellipse(12,10-bob,3,2,light);}
  if(spec.shape==='humanoid'){const h=humanoid(frame,dir,{robe:base,trim:light,hair:dark});c.blit(h,4,0);return c;}
  c.outline('#1b1a22');
  return c;
}
// prop 16x16 (signpost / crate) for object-type NPCs
function prop(kind){const c=new Canvas(16,16);if(kind==='sign'){c.rect(7,6,2,10,'#7a4b2a');c.rect(2,2,12,6,'#c98d4f');c.rect(3,3,10,4,'#e8b877');c.rect(4,4,8,1,'#7a4b2a');}else{c.rect(2,4,12,11,'#a06a3a');c.rect(2,4,12,2,'#c98d4f');c.rect(7,4,2,11,'#6a4425');c.rect(2,9,12,1,'#6a4425');}c.outline('#1b1a22');return c;}
function sheet(name,frameW,frameH,draw) {
  const dirs=['down','up','left','right'];const c=new Canvas(frameW*4,frameH*4);
  dirs.forEach((dir,row)=>{for(let f=0;f<4;f++){const src=draw(f,dir==='right'?'left':dir);c.blit(src,f*frameW,row*frameH,dir==='right');}});
  fs.writeFileSync(path.join(OUT,`${name}.png`),encodePNG(c.w,c.h,c.d));
  return {file:`${name}.png`,frameWidth:frameW,frameHeight:frameH,frames:4,rows:{down:0,up:1,left:2,right:3},anchor:[frameW/2,frameH-2]};
}
const manifest={schemaVersion:1,generator:'scripts/build_sprites.mjs',sprites:{}};
// players: gender x school
for(const [school,{robe,trim}] of Object.entries(SCHOOL)){
  manifest.sprites[`player_boy_${school}`]=sheet(`player_boy_${school}`,24,32,(f,d)=>humanoid(f,d,{robe,trim,hair:'#5a3a22'}));
  manifest.sprites[`player_girl_${school}`]=sheet(`player_girl_${school}`,24,32,(f,d)=>humanoid(f,d,{robe,trim,hair:'#c96a3c',long:true}));
}
// npc villagers and mentors
const NPC_VARIANTS=[['villager_a','#6b8fb5','#dfe9f4','#3b2a1f',false,null],['villager_b','#b56b6b','#f4dfdf','#e0c060',true,null],['villager_c','#6bb58a','#e0f4e8','#2f2f3a',false,null],['villager_d','#b59a6b','#f4ecdc','#8a4a2a',true,null],['villager_e','#8a6bb5','#ece0f4','#f1e6c8',false,null],['villager_f','#5f7d8c','#d7e6ee','#6a4a3a',false,null],['mentor_fire','#d9502f','#f4b66c','#3b2a1f',false,'#8a2c14'],['mentor_ice','#3d8fd6','#bfe9ff','#f1f6ff',true,'#215a8f'],['mentor_storm','#7b56c9','#e0c9ff','#2f2f3a',false,'#4a2f8a'],['mentor_death','#3f7d6a','#a8e0c4','#1f2a2a',false,'#24483d'],['mentor_life','#d8a53c','#fff2b8','#8a5a2a',true,'#946a1c']];
for(const [name,robe,trim,hair,long,hat] of NPC_VARIANTS)manifest.sprites[name]=sheet(name,24,32,(f,d)=>humanoid(f,d,{robe,trim,hair,long,hat}));
// mobs of Haqi Town plus generic archetypes per school for other islands
const MOBS={WaterBubble:{shape:'blob',base:'#5ab4f0',dark:'#2c6fae',light:'#d8f3ff'},DeathBubble:{shape:'blob',base:'#7a5fa8',dark:'#3e2d63',light:'#d5c6f5'},
  TreeMonster:{shape:'tree',base:'#4f9a3c',dark:'#6a4224',light:'#a5d96a'},DeadTreeMonster:{shape:'cat',base:'#f0d8a0',dark:'#8a6a3a',light:'#fff3d6',accent:'#d95050'},
  BlazeHairMonster:{shape:'ogre',base:'#c2542c',dark:'#6a2b14',light:'#f5b98c',accent:'#ffb02e'},OrangeBaby:{shape:'fruit',base:'#ff9a2e',dark:'#b85f0c',light:'#ffd9a3'},
  StrawberryGirl:{shape:'fruit',base:'#e8405a',dark:'#8f1c30',light:'#ffb3c0'},Pineapple:{shape:'fruit',base:'#e6c04a',dark:'#8a6a12',light:'#fff0a8'},
  UndeadManekiNeko:{shape:'cat',base:'#8b8fa8',dark:'#3c3f52',light:'#d9dcec',accent:'#7ad6a8'},IceManekiNeko:{shape:'cat',base:'#dfe9f5',dark:'#5b7ea3',light:'#ffffff',accent:'#5ab4f0'},
  FireManekiNeko:{shape:'cat',base:'#f2c27a',dark:'#8a5a1a',light:'#fff2cc',accent:'#e0503a'},ForestSpikyOgreLower:{shape:'ogre',base:'#7a6a52',dark:'#3e3324',light:'#c7b698',accent:'#4f9a3c'},
  ForestSpikyOgre:{shape:'ogre',base:'#6e5a3f',dark:'#352a1c',light:'#c2ad8a',accent:'#2f7a2a'},FireRockyOgre:{shape:'ogre',base:'#8a3c2a',dark:'#3e1a12',light:'#e8a070',accent:'#ff7a2e'},
  FireRockyOgre_01:{shape:'ogre',base:'#a0472e',dark:'#4a2014',light:'#efb08a',accent:'#ff9a2e'},SirBanana:{shape:'fruit',base:'#f2df4a',dark:'#a08a12',light:'#fff8b8'},
  generic_fire:{shape:'ghost',base:'#e26a3a',dark:'#7a2a10',light:'#ffc09a'},generic_ice:{shape:'ghost',base:'#6cbaf0',dark:'#245a90',light:'#e0f4ff'},generic_storm:{shape:'ghost',base:'#9a74dd',dark:'#4a2f8a',light:'#e6d8ff'},
  generic_life:{shape:'ghost',base:'#7fc86a',dark:'#2f6a2a',light:'#dfffd0'},generic_death:{shape:'ghost',base:'#5f7f78',dark:'#22332f',light:'#c8e8e0'},generic_bee:{shape:'bee',base:'#f0c030',dark:'#3a2a10',light:'#fff'}};
for(const [name,spec] of Object.entries(MOBS))manifest.sprites[`mob_${name}`]=sheet(`mob_${name}`,32,32,(f,d)=>mob(f,d,spec));
for(const kind of ['sign','crate']){const c=prop(kind);fs.writeFileSync(path.join(OUT,`prop_${kind}.png`),encodePNG(c.w,c.h,c.d));manifest.sprites[`prop_${kind}`]={file:`prop_${kind}.png`,frameWidth:16,frameHeight:16,frames:1,rows:{down:0,up:0,left:0,right:0},anchor:[8,15]};}
fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
console.log(`${Object.keys(manifest.sprites).length} sprite sheets written to ${OUT}`);
