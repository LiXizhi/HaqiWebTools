// Stable screen-space placement; connectors keep every displaced name attached
// to its real city point. Sizes are measured by the browser view.
export function layoutEarthMapLabels(points,width,height,reserved=[]){
    const boxes=[...reserved],gap=5,result=[];
    const overlaps=(a,b)=>a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;
    for(const point of [...points].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
        let box=null;
        const fits=candidate=>candidate.x>=6&&candidate.y>=6&&candidate.x+candidate.w<=width-6&&candidate.y+candidate.h<=height-6&&!boxes.some(other=>overlaps(candidate,other));
        for(let ring=0;ring<18&&!box;ring++){
            const step=point.h+gap;
            for(const dy of ring?[ -ring*step,ring*step ]:[0])for(const dx of [10,-point.w-10,10+ring*24,-point.w-10-ring*24]){
                const candidate={x:point.x+dx,y:point.y-point.h/2+dy,w:point.w,h:point.h};
                if(fits(candidate)){box=candidate;break;}
            }
        }
        if(!box){
            const candidates=[];
            for(let y=6;y+point.h<=height-6;y+=point.h+gap)for(let x=6;x+point.w<=width-6;x+=24)candidates.push({x,y,w:point.w,h:point.h});
            candidates.sort((a,b)=>Math.hypot(a.x+a.w/2-point.x,a.y+a.h/2-point.y)-Math.hypot(b.x+b.w/2-point.x,b.y+b.h/2-point.y));
            box=candidates.find(fits)||null;
        }
        if(box)boxes.push(box);
        result.push({...point,box});
    }
    return result;
}
