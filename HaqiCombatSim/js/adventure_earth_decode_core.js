// Palette matching is shared by Worker and timed fallback, with identical tie order.
export function* classifyEarthTerrain(pixels,palette,indices=new Uint8Array(pixels.length/4)){
    const colors=palette.map(row=>({raw:[0,2,4].map(i=>parseInt(row.rgb.slice(i,i+2),16)),out:[1,3,5].map(i=>parseInt(row.color.slice(i,i+2),16))}));
    for(let i=0;i<indices.length;i++){
        if(i%256===0)yield;
        const offset=i*4;if(!pixels[offset+3]){indices[i]=255;pixels.set([111,119,117,255],offset);continue;}
        let best=0,min=Infinity;const r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
        for(let n=0;n<colors.length;n++){const raw=colors[n].raw,d=(raw[0]-r)**2+(raw[1]-g)**2+(raw[2]-b)**2;if(d<min){best=n;min=d;}}
        indices[i]=best;pixels[offset]=colors[best].out[0];pixels[offset+1]=colors[best].out[1];pixels[offset+2]=colors[best].out[2];pixels[offset+3]=255;
    }
    return indices;
}
