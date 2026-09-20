// Pure geometry shared by the offline generator, collision and rendering.
export function mapInfo(zone,content) {
    const info=content?.worldMapIndex?.islands?.[zone];
    if(!info)throw Error('缺少岛屿配置：'+zone+'，请运行 npm run generate:maps');
    return info;
}
export function worldDimensions(zone,content) {const {w,h}=mapInfo(zone,content);return {w,h};}
export function segmentDistance(p,a,b) {
    const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function insidePolygon(x,y,points) {
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[i],[bx,by]=points[j];
        if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
    }
    return inside;
}
export function onLargeIsland(world,x,y,padding=0) {
    if(!insidePolygon(x,y,world.layout.coast))return false;
    if(padding<=0)return true;
    return world.layout.coast.every(([ax,ay],i)=>{const [bx,by]=world.layout.coast[(i+1)%world.layout.coast.length];return segmentDistance({x,y},{x:ax,y:ay},{x:bx,y:by})>=padding;});
}
export function riverBlocks(world,x,y) {
    if(!world.layout)return false;
    if(world.layout.lakes?.some(l=>((x-l.x)/(l.rx+12))**2+((y-l.y)/(l.ry+12))**2<1))return true;
    if(world.layout.bridges.some(b=>{const a=b.angle||0,dx=x-b.x,dy=y-b.y;return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<b.w/2-10&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<b.h/2-10;}))return false;
    return world.layout.rivers.some(r=>r.points.slice(1).some(([bx,by],i)=>segmentDistance({x,y},{x:r.points[i][0],y:r.points[i][1]},{x:bx,y:by})<r.width/2+12));
}
export function regionAt(world,p) {
    return world.layout?.regions.reduce((best,r)=>{
        const d=((p.x-r.x)/r.rx)**2+((p.y-r.y)/r.ry)**2;
        return d<(best?.d??Infinity)?{...r,d}:best;
    },null)||null;
}
