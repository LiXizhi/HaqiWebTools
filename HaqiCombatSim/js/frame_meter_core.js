// Rendered-frame cadence, bounded counters only; paused scenes start a fresh window.
export function createFrameMeter(){
    let previous=null,start=null,frames=0,value=null;
    return {sample(time,active=true){
        if(!active||!Number.isFinite(time)){previous=null;start=null;frames=0;value=null;return value;}
        if(previous===null||time<=previous||time-previous>1000){start=time;frames=0;value=null;}
        else frames++;
        previous=time;
        if(time-start>=500){const ms=(time-start)/frames;value={fps:Math.round(1000/ms),ms:Math.round(ms*10)/10};start=time;frames=0;}
        return value;
    },get value(){return value;}};
}
