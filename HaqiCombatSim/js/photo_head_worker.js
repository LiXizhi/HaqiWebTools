import {removeHeadBackground,checkHeadPixels} from './photo_head_pixels_core.js';
self.onmessage=async({data:{id,blob,strength}})=>{
    let bitmap;
    try{
        bitmap=await createImageBitmap(blob);
        if(bitmap.width!==bitmap.height||bitmap.width%4||bitmap.width>4096)throw Error('生成图尺寸无效');
        const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
        pixels.data.set(removeHeadBackground(pixels.data,canvas.width,canvas.height,{strength}));
        checkHeadPixels(pixels.data,canvas.width,canvas.height);ctx.putImageData(pixels,0,0);
        self.postMessage({id,blob:await canvas.convertToBlob({type:'image/png'}),width:canvas.width,height:canvas.height});
    }catch{self.postMessage({id,error:'图集去背景失败，请检查背景、方向和完整性后重试。'});}
    finally{bitmap?.close();}
};
