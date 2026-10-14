import {clearSegment,findPathSteps} from './adventure_world_core.js';

// One lazy hero worker reuses the island path protocol/algorithm. The fallback
// drains the same iterator in short slices, including graph and visibility work.
export function createIslandHeroNavigation({workerFactory=typeof Worker==='undefined'?null:()=>new Worker(new URL('./island_path_worker.js',import.meta.url),{type:'module'}),schedule=fn=>setTimeout(fn,0),cancelSchedule=clearTimeout,now=()=>performance.now(),budget=2,steps=findPathSteps,clear=clearSegment,setTimer=setTimeout,clearTimer=clearTimeout}={}){
    let worker=null,failed=false,scene=null,sceneVersion=0,sequence=0,pending=null;
    const geometry=world=>[world,world.layout,world.paths,world.trees,world.buildings];
    const same=(a,b)=>a?.length===b?.length&&a.every((v,i)=>v===b[i]);
    function valid(row){return pending===row&&row.isLive()&&same(row.geometry,geometry(row.world));}
    function cancel(){
        const row=pending;if(!row)return;
        pending=null;if(row.task!==null)cancelSchedule(row.task);clearTimer(row.timer);
        try{worker?.postMessage({type:'cancel',id:row.id});}catch{/* A failed worker is handled on the next request. */}
    }
    function finish(row,path){if(!valid(row)){if(pending===row)cancel();return;}pending=null;clearTimer(row.timer);row.onResult(path);}
    function fallback(row){
        if(!valid(row))return;
        clearTimer(row.timer);row.iterator=steps(row.world,row.from,row.to);
        const work=()=>{
            row.task=null;if(!valid(row)){if(pending===row)cancel();return;}
            const begin=now();let count=0;
            try{do{const next=row.iterator.next();if(next.done){finish(row,next.value);return;}}while(++count<128&&now()-begin<budget);}
            catch{finish(row,[]);return;}
            row.task=schedule(work);
        };
        row.task=schedule(work);
    }
    function fail(){if(failed)return;failed=true;worker?.terminate();worker=null;scene=null;if(pending)fallback(pending);}
    function ensure(world){
        if(!worker){
            worker=workerFactory();if(!worker)throw Error('寻路后台不可用');
            worker.onerror=fail;
            worker.onmessage=({data})=>{const row=pending;if(failed||!row||row.id!==data.id||row.sceneVersion!==data.sceneVersion)return;if(data.error)fail();else finish(row,data.path);};
        }
        const next=geometry(world);
        if(!same(scene,next)){
            scene=next;sceneVersion++;
            const snapshot={zone:world.zone,w:world.w,h:world.h,layout:world.layout,center:world.center,paths:world.paths,trees:world.trees,buildings:world.buildings,npcs:world.npcs,encounters:world.encounters,portal:world.portal};
            worker.postMessage({type:'scene',sceneVersion,world:snapshot});
        }
    }
    return {
        request(world,from,to,{roleId=null,isLive=()=>true,onResult}={}){
            cancel();
            if(clear(world,from,to)){if(isLive())onResult([{x:to.x,y:to.y}]);return;}
            const row={id:++sequence,roleId,world,geometry:geometry(world),from:{...from},to:{x:to.x,y:to.y},isLive,onResult,task:null,timer:null};pending=row;
            if(!workerFactory||failed){fallback(row);return;}
            try{ensure(world);row.sceneVersion=sceneVersion;row.timer=setTimer(fail,15000);worker.postMessage({type:'hero-path',id:row.id,roleId,sceneVersion,from:row.from,to:row.to});}
            catch{fail();}
        },
        cancel,
        dispose(){cancel();worker?.terminate();worker=null;scene=null;},
        stats:()=>({pending:!!pending,worker:!!worker,fallback:failed||!workerFactory}),
    };
}
