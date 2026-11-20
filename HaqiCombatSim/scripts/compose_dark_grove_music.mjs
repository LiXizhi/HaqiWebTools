// Deterministic original ambient loop for the shadow grove. Run with Node.js.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const rate=22050, seconds=24, frames=rate*seconds;
const out=new Float32Array(frames);
const chords=[
  [146.83,174.61,220,261.63], // D minor 7
  [116.54,146.83,174.61,220], // B flat major 7
  [98,146.83,174.61,233.08], // G minor 9
  [110,164.81,196,261.63], // A minor 7, with leading tension
];
function tone(start,duration,hz,gain,kind='pad'){
  const first=Math.max(0,Math.round(start*rate));
  const last=Math.min(frames,Math.round((start+duration)*rate));
  for(let i=first;i<last;i++){
    const t=(i/rate)-start,p=t/duration;
    const env=kind==='pluck'?Math.min(1,t*40)*Math.exp(-4.8*p):
      kind==='bell'?Math.min(1,t*75)*Math.exp(-5.4*p):
      Math.min(1,t*2.8,(duration-t)*2.8);
    const phase=2*Math.PI*hz*t;
    const wave=kind==='bell'?Math.sin(phase)+.22*Math.sin(phase*2.01)+.1*Math.sin(phase*3.98):
      kind==='pluck'?Math.sin(phase)+.28*Math.sin(phase*2)+.09*Math.sin(phase*3):
      Math.sin(phase)+.19*Math.sin(phase*2)+.07*Math.sin(phase*3);
    out[i]+=gain*env*wave;
  }
}
for(let bar=0;bar<8;bar++){
  const start=bar*3,chord=chords[bar%4];
  tone(start,3.1,chord[0]/2,.045);
  for(let n=1;n<4;n++)tone(start+.02*n,3.08,chord[n],.022);
  for(let beat=0;beat<4;beat++){
    const note=chord[[1,2,3,2][beat]]*2;
    tone(start+beat*.75,1.35,note,.057,'pluck');
  }
  if(bar%2===1)tone(start+1.5,2.2,chord[3]*4,.027,'bell');
}
// Quiet high harmonics and a short seam fade keep the ambience soft and loopable.
for(let i=0;i<frames;i++){
  const t=i/rate;
  out[i]+=.006*Math.sin(2*Math.PI*55*t)*Math.sin(2*Math.PI*.18*t);
  const edge=Math.min(1,t/.12,(seconds-t)/.12);
  out[i]*=Math.max(0,edge);
}
let peak=0;for(const sample of out)peak=Math.max(peak,Math.abs(sample));
const scale=.82/peak,pcm=Buffer.alloc(44+frames*2);
pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);
pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);
pcm.writeUInt32LE(rate,24);pcm.writeUInt32LE(rate*2,28);
pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);
pcm.write('data',36);pcm.writeUInt32LE(frames*2,40);
for(let i=0;i<frames;i++)pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,out[i]*scale))*32767),44+i*2);
const target=resolve(dirname(fileURLToPath(import.meta.url)),'../assets/adventure/audio/dark_grove.wav');
await mkdir(dirname(target),{recursive:true});await writeFile(target,pcm);
console.log(JSON.stringify({target,seconds,rate,bytes:pcm.length,peak:Number((peak*scale).toFixed(3))}));
