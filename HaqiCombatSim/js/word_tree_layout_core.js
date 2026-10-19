import {createRng,hashSeed} from './rng_core.js';
export const defaultCamera=()=>({yaw:0,pitch:.08,zoom:1,x:0,y:0});
export function project(p,camera,width,height){
    return createProjector(camera,width,height)(p);
}
export function createProjector(camera,width,height){
    const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch);
    const base=Math.min(width/510,height/450)*camera.zoom*680,ox=width/2+camera.x,oy=height*.64+camera.y;
    return p=>{const x=p.x*cy+p.z*sy,z=-p.x*sy+p.z*cy,y=p.y*cp-z*sp,depth=p.y*sp+z*cp,scale=base/(680-depth);
        return {x:ox+x*scale,y:oy-y*scale,depth,scale};};
}
export function chooseLabels(points,limit,width,height,measure,selectedId,depthSorted=false){
    const chosen=[];
    const candidates=depthSorted?[...points].reverse():[...points].sort((a,b)=>b.depth-a.depth);
    if(selectedId){const index=candidates.findIndex(p=>p.node.id===selectedId);if(index>0)candidates.unshift(candidates.splice(index,1)[0]);}
    for(const p of candidates){
        const w=measure(p.node.entry.text)+24,h=46,box={left:p.x-w/2,top:p.y-h/2,right:p.x+w/2,bottom:p.y+h/2};
        if(box.left<10||box.right>width-10||box.top<10||box.bottom>height-10)continue;
        if(chosen.some(q=>box.left<q.box.right+9&&box.right>q.box.left-9&&box.top<q.box.bottom+7&&box.bottom>q.box.top-7))continue;
        chosen.push({...p,box});if(chosen.length>=limit)break;
    }
    return chosen;
}
export function hitLabel(labels,x,y){return labels.findLast(p=>x>=p.box.left&&x<=p.box.right&&y>=p.box.top&&y<=p.box.bottom)?.node||null;}
export function fitCamera(nodes,width,height,yaw=0){
    const camera={...defaultCamera(),yaw},projector=createProjector(camera,width,height);
    const points=[...nodes,{x:-95,y:-133,z:0},{x:95,y:-133,z:0}].map(projector);
    const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
    camera.zoom=Math.min((width-60)/Math.max(1,maxX-minX),(height-140)/Math.max(1,maxY-minY));
    camera.x=-((minX+maxX)/2-width/2)*camera.zoom;
    camera.y=height*.5-(height*.64+((minY+maxY)/2-height*.64)*camera.zoom);
    return camera;
}
export const TREE_WORD_LIMIT=600;
// Limit rendering only; learning records remain complete. Active fruit targets stay visible.
export function createEncounterTree(words,priorityIds=new Set()){
    const priority=w=>priorityIds.has(w.id)?2:(w.mark||w.count>0?1:0);
    const ordered=[...words].sort((a,b)=>priority(b)-priority(a)||Math.max(b.markAt||0,b.lastAt||0)-Math.max(a.markAt||0,a.lastAt||0)||a.ordinal-b.ordinal||a.id.localeCompare(b.id)).slice(0,TREE_WORD_LIMIT).sort((a,b)=>a.ordinal-b.ordinal),branches=[],nodes=[];
    for(let b=0;b<18;b++){const angle=b*2.39996,radius=95+(b%3)*28;branches.push({start:{x:Math.sin(b)*9,y:-80+b*5,z:Math.cos(b)*9},end:{x:Math.cos(angle)*radius,y:80+(b%6)*24,z:Math.sin(angle)*radius},width:9-b*.25});}
    for(const word of ordered){const branch=hashSeed(word.id)%18,tip=branches[branch].end,rng=createRng(hashSeed(word.id)),angle=rng.float()*Math.PI*2,u=rng.float()*2-1,r=Math.cbrt(rng.float());
        nodes.push({id:word.id,index:word.ordinal,branch,word,entry:{id:word.id,text:word.id,meaning:''},x:tip.x+Math.cos(angle)*Math.sqrt(1-u*u)*r*62,y:tip.y+u*r*49,z:tip.z+Math.sin(angle)*Math.sqrt(1-u*u)*r*62});}
    return {branches,nodes};
}
export function fadeTreeLabels(cache,labels,t,reduced=false){
    const wanted=new Set(labels.map(p=>p.node.id));for(const f of cache.values())f.wanted=wanted.has(f.node.id);
    for(const p of labels){let f=cache.get(p.node.id);if(!f){f={...p,alpha:0,since:t,last:t};cache.set(p.node.id,f);}Object.assign(f,p,{wanted:true});}
    // Clamp elapsed time so resuming a background tab cannot reveal text in one frame.
    for(const [id,f] of cache){const dt=Math.min(64,Math.max(0,t-f.last));f.last=t;
        if(!f.wanted)f.alpha=Math.max(0,f.alpha-dt/(reduced?120:320));
        else if(t-f.since>=(reduced?0:80))f.alpha=Math.min(1,f.alpha+dt/(reduced?120:420));
        if(!f.wanted&&f.alpha===0)cache.delete(id);
    }
    return [...cache.values()];
}

// Balanced foreground slots; unavailable or occluded groups lend their slots to others.
export function languageTreeLabelLimit(width,height){
    return Math.max(6,Math.min(32,Math.round(Math.max(0,width)*Math.max(0,height)/42000)));
}
export function chooseLearningLabels(points,limit,width,height,measure,selectedId,lowPriority=new Set()){
    const kinds=['unknown','seen','basic','know','mastered'],weights={unknown:1.4,seen:1.2,basic:1.1,know:1,mastered:.7};
    const groups=new Map(kinds.map(k=>[k,[]])),counts=Object.fromEntries(kinds.map(k=>[k,0])),chosen=[];
    const ordered=[...points].sort((a,b)=>Number(lowPriority.has(a.node.id))-Number(lowPriority.has(b.node.id))||b.depth-a.depth||a.node.id.localeCompare(b.node.id));
    for(const p of ordered)(groups.get(p.node.status?.kind)||groups.get('seen')).push(p);
    function add(p){const labels=chooseLabels([...chosen,p].reverse(),chosen.length+1,width,height,measure,null,true);if(labels.length<=chosen.length)return false;chosen.push(labels.at(-1));counts[p.node.status?.kind in counts?p.node.status.kind:'seen']++;return true;}
    if(limit<=0)return chosen;
    const selected=ordered.find(p=>p.node.id===selectedId);if(selected)add(selected);
    while(chosen.length<limit){
        const active=kinds.filter(k=>groups.get(k).length).sort((a,b)=>counts[a]/weights[a]-counts[b]/weights[b]||kinds.indexOf(a)-kinds.indexOf(b));
        if(!active.length)break;
        const group=groups.get(active[0]);let accepted=false;
        while(group.length&&!accepted){const p=group.shift();if(!chosen.some(q=>q.node.id===p.node.id))accepted=add(p);}
    }
    return chosen;
}
