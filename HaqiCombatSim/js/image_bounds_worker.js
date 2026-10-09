import {imageAlphaBoundsSteps} from './image_bounds_core.js';

// Shared island/Earth art preparation, independent of world generation.
self.onmessage=({data:{id,image,rect}})=>{
    let canvas;
    try{
        rect=rect||[0,0,image.width,image.height];canvas=new OffscreenCanvas(Math.ceil(rect[2]),Math.ceil(rect[3]));
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,...rect,0,0,canvas.width,canvas.height);
        const steps=imageAlphaBoundsSteps(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,rect);
        let result;do{result=steps.next();}while(!result.done);self.postMessage({id,bounds:result.value});
    }catch{self.postMessage({id,bounds:null});}
    finally{image.close();if(canvas)canvas.width=canvas.height=0;}
};
