// Original alpha trimming rule, shared by synchronous drawing and background preparation.
export function* imageAlphaBoundsSteps(data,width,height,rect=[0,0,width,height]){
    let left=width,top=height,right=0,bottom=0;
    for(let y=0;y<height;y++){
        for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>20){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        yield;
    }
    return left>right?rect:[rect[0]+left,rect[1]+top,right-left+1,bottom-top+1];
}
