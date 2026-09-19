// Authored 2D adaptation of the kids town map; geometry is not combat balance.
// Reference and deliberate differences: docs/island-exploration.md.
export const TOWN_LAYOUT = {
    version: 1, w: 5600, h: 4400, spawn: {x:3500,y:3000},
    coast: [[650,2400],[520,1800],[800,1180],[1500,720],[2450,380],[3200,630],[3600,1200],[4240,1300],[4490,2020],[5050,2350],[4930,2920],[4550,3080],[4460,3620],[3650,3910],[2880,3890],[2600,3650],[1550,3700],[850,3200]],
    regions: [
        {id:'snow',name:'雪山眺望台',x:2300,y:1120,rx:1130,ry:710,color:'#c3dbd4',description:'北方的雪峰与山脚林地连成一线。沿山路向东，可以望见金色的山谷。'},
        {id:'forest',name:'西部密林',x:1240,y:1930,rx:690,ry:850,color:'#527d55',description:'林间小路弯向雪山，河岸的岔路则通往南边田野。留意远离大路的怪物。'},
        {id:'gold',name:'金色山谷',x:3650,y:1710,rx:710,ry:650,color:'#c9aa65',description:'金色岩坡隔开了北方山地和东部海岸。沿南坡绕行，可以回到小镇。'},
        {id:'farm',name:'河畔田野',x:1570,y:2880,rx:850,ry:560,color:'#a1b965',description:'农田之间留着宽阔的田埂。过桥是小镇，沿河向南则是一片安静的湖岸。'},
        {id:'lake',name:'南部湖畔',x:2400,y:3410,rx:640,ry:470,color:'#82ad75',description:'河水在这里汇成湖泊。水泡怪在远处的岸边活动，主路上可以安心经过。'},
        {id:'town',name:'哈奇小镇',x:3500,y:3000,rx:950,ry:680,color:'#adc184',description:'熟悉的小镇是探索的起点。西行过桥去田野，北行通往山谷，东行可到海滨。'},
        {id:'park',name:'东部海滨',x:4610,y:2620,rx:510,ry:460,color:'#b2c889',description:'海风从东边吹来。原版地图上的游乐区域位于这一侧，专属设施和故事将逐步补全。'},
        {id:'beach',name:'南岸沙滩',x:3650,y:3670,rx:810,ry:280,color:'#e8d7a2',description:'从小镇走到海边，沿弯曲的沙滩回望山林。营地传送门就在小镇南侧。'},
    ],
    rivers: [
        {points:[[2680,1390],[2790,1780],[2540,2210],[2060,2350],[1780,2590],[1950,2920],[2470,3130],[2540,3400],[2780,3510]],width:105},
        {points:[[2540,2210],[3060,2190],[3670,2270],[4210,2310],[4690,2470]],width:88},
    ],
    lakes: [{x:2780,y:3510,rx:180,ry:110}],
    bridges: [{x:2010,y:2375,w:225,h:260},{x:3230,y:2210,w:250,h:230},{x:2400,y:3100,w:230,h:250},{x:4530,y:2415,w:240,h:250}],
    routes: [
        [[3500,3600],[3500,3000],[3220,2650],[3230,2210],[3450,1960],[3650,1710]],
        [[3500,3000],[3040,2820],[2470,2760],[2240,2660],[2010,2375],[1760,2330],[1600,2590],[1700,2690],[1570,2880]],
        [[1570,2880],[1700,2690],[1600,2590],[1760,2330],[2010,2375],[2010,2100],[1580,2180],[1240,1930]],
        [[1240,1930],[1500,1580],[1890,1530],[2120,1240],[2300,1120]],
        [[2300,1120],[2640,990],[2940,1150],[3060,1680],[3230,2210]],
        [[1570,2880],[1750,3290],[2080,3470],[2400,3410],[2400,3100],[2470,2760]],
        [[3500,3000],[4050,3030],[4450,2820],[4610,2620]],
        [[4610,2620],[4530,2415],[4340,2050],[3960,1910],[3650,1710]],
        [[3500,3600],[3650,3670],[4080,3500],[4050,3030]],
    ],
    npcPositions: {30525:[3500,2860],30081:[3190,3050],30112:[3770,2870]},
    encounterPositions: {'water-bubble':[2230,3520],'death-bubble':[1070,2130]},
};

export function worldDimensions(zone) {return zone==='town'?{w:TOWN_LAYOUT.w,h:TOWN_LAYOUT.h}:{w:1800,h:1600};}
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
    if(world.layout.bridges.some(b=>Math.abs(x-b.x)<b.w/2-10&&Math.abs(y-b.y)<b.h/2-10))return false;
    return world.layout.rivers.some(r=>r.points.slice(1).some(([bx,by],i)=>segmentDistance({x,y},{x:r.points[i][0],y:r.points[i][1]},{x:bx,y:by})<r.width/2+12));
}
export function regionAt(world,p) {
    return world.layout?.regions.reduce((best,r)=>{
        const d=((p.x-r.x)/r.rx)**2+((p.y-r.y)/r.ry)**2;
        return d<(best?.d??Infinity)?{...r,d}:best;
    },null)||null;
}
