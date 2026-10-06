import {paintLargeTerrain} from './adventure_large_terrain.js';
let world=null,manifest=null,images={};
self.onmessage=({data})=>{
    if(data.type==='scene'){for(const image of Object.values(images))image.close();world=data.world;manifest=data.manifest;images=data.images;return;}
    const {id,rect,pixels,scale}=data;let canvas;
    try{canvas=new OffscreenCanvas(pixels,pixels);const c=canvas.getContext('2d',{willReadFrequently:true});c.scale(scale,scale);c.translate(-rect.x,-rect.y);const atlases=new Set();
        const art={draw(c,atlas,name,x,y,w,h){atlases.add(atlas);const crop=manifest?.atlases[atlas]?.frames[name]?.rect,image=images[atlas];if(!crop||!image)return false;const ratio=Math.min(w/crop[2],h/crop[3]),dw=crop[2]*ratio,dh=crop[3]*ratio;c.drawImage(image,...crop,x+(w-dw)/2,y+h-dh,dw,dh);return true;}};
        paintLargeTerrain(c,world,rect,false,art);const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap,atlases:[...atlases]},[bitmap]);
    }catch(error){self.postMessage({id,error:String(error)});}finally{if(canvas)canvas.width=canvas.height=0;}
};
