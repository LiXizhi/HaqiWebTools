import {buildEarthScene,createEarthSceneCache} from './adventure_earth_scene_core.js';
import {classifyEarthTerrain} from './adventure_earth_decode_core.js';
import {imageAlphaBoundsSteps} from './image_bounds_core.js';
import {earthGeo,terrainKey,terrainBounds,parseEarthCities} from './adventure_earth_core.js';
const cache=createEarthSceneCache(),acks=new Map(),sceneTerrain=new Map();
let previousScene=new Map(),objectSequence=0;
function drain(steps){let row;do{row=steps.next();}while(!row.done);return row.value;}
async function sendParts(message,result){
    const arrays=['paths','buildings','npcs','landmarks','trees','encounters','mapCities','wildSpawns','wildAuthored'],batchSize=message.payload.rules.streamPacketRows,nextScene=new Map();let serial=0;
    for(const part of arrays){const rows=result[part]||[];for(let i=0;i<rows.length;i+=batchSize){
        const next=++serial,batch=rows.slice(i,i+batchSize),refs=[],signatures=[],changed=[];
        for(const row of batch){
            const signature=row.earthSignature,key=signature&&part+':'+signature,reference=key&&previousScene.get(key),ref=reference||++objectSequence;
            refs.push(ref);changed.push(reference?null:row);signatures.push(reference?null:signature);if(key)nextScene.set(key,ref);
        }
        await new Promise(resolve=>{acks.set(`${message.id}:${next}`,resolve);self.postMessage({id:message.id,epoch:message.epoch,version:message.version,part,rows:changed,refs,signatures,serial:next});});
    }result[part]=[];}
    previousScene=nextScene;
    // Layout aliases are reconstructed after receipt; never clone the large arrays twice.
    for(const key of ['paths','buildings','trees','landmarks'])delete result.layout[key];
}
self.onmessage=async({data:message})=>{
    if(message.ack){const key=`${message.ack}:${message.serial}`;acks.get(key)?.();acks.delete(key);return;}
    const {id,type,payload,epoch,version}=message,start=performance.now();
    try{
        let result,transfer=[];
        if(type==='terrain'){
            const bitmap=await createImageBitmap(payload.blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),c=canvas.getContext('2d',{willReadFrequently:true});
            try{c.drawImage(bitmap,0,0);}finally{bitmap.close();}
            const pixels=c.getImageData(0,0,canvas.width,canvas.height),indices=drain(classifyEarthTerrain(pixels.data,payload.palette));c.putImageData(pixels,0,0);
            const image=canvas.transferToImageBitmap();result={key:payload.key,image,indices,types:payload.palette.map(p=>p.type),width:canvas.width,height:canvas.height,bytes:canvas.width*canvas.height*5};transfer=[image,indices.buffer];
        }else if(type==='bounds'){
            const image=payload.image,rect=payload.rect||[0,0,image.width,image.height],canvas=new OffscreenCanvas(Math.ceil(rect[2]),Math.ceil(rect[3]));
            try{const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,...rect,0,0,canvas.width,canvas.height);result=drain(imageAlphaBoundsSteps(c.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,rect));}
            finally{image.close();canvas.width=canvas.height=0;}
        }else if(type==='cities')result=parseEarthCities(payload.text);
        else if(type==='scene'){
            for(const tile of payload.terrain)sceneTerrain.set(tile.key,tile);
            const keys=new Set(payload.terrainKeys||payload.terrain.map(t=>t.key));for(const key of sceneTerrain.keys())if(!keys.has(key))sceneTerrain.delete(key);
            const terrain=sceneTerrain;
            const typeAt=(x,y)=>{const geo=earthGeo({x,y},payload.rules),tile=terrain.get(terrainKey(geo.lon,geo.lat));if(!tile)return null;
                const b=terrainBounds(tile.key),ix=Math.max(0,Math.min(tile.width-1,Math.floor((geo.lon-b.west)/2*tile.width))),iy=Math.max(0,Math.min(tile.height-1,Math.floor((b.north-geo.lat)/2*tile.height)));return tile.types[tile.indices[iy*tile.width+ix]];};
            const target={...payload.target,terrainAt:typeAt};result=drain(buildEarthScene({...payload,target,typeAt,cache}));delete result.terrainAt;
            await sendParts(message,result);
        }else throw Error('未知地球后台任务');
        self.postMessage({id,epoch,version,result,duration:performance.now()-start},transfer);
    }catch(error){self.postMessage({id,epoch,version,error:error.message});}
};
