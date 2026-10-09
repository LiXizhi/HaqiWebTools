// Wall-clock deadlines; repainting, selecting cards and background throttling never reset them.
// Presentation-only opponent arrivals, independent of combat RNG and turn clocks.
export function createArenaArrivals({schedule=setTimeout,cancel=clearTimeout,onJoin=()=>{},onReady=()=>{}}={}){
    let timers=[],generation=0;
    function stop(){generation++;for(const timer of timers)cancel(timer);timers=[];}
    return {stop,start(count,duration){
        stop();const token=generation;
        for(let i=1;i<=count;i++)timers.push(schedule(()=>{
            if(token!==generation)return;
            onJoin(i);
            if(i===count&&token===generation){timers=[];onReady();}
        },Math.round(duration*i/count)));
    }};
}
export function createArenaClock({now=Date.now,schedule=setTimeout,cancel=clearTimeout,onSecond=()=>{},onExpire=()=>{}}={}){
    let deadline=null,timer=null,last=null;
    const remaining=()=>deadline===null?null:Math.max(0,Math.ceil((deadline-now())/1000));
    function stop(){if(timer!==null)cancel(timer);timer=null;deadline=null;last=null;}
    function tick(){
        timer=null;if(deadline===null)return;
        const seconds=remaining();
        if(seconds!==last){last=seconds;onSecond(seconds);}
        if(seconds===0){stop();onExpire();return;}
        timer=schedule(tick,100);
    }
    return {remaining,stop,start(ms){stop();deadline=now()+ms;tick();},claim(){const expired=deadline!==null&&now()>=deadline;stop();return {expired};}};
}
