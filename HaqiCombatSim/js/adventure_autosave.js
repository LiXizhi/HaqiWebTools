// Browser-side scheduler. Clock, persistence and eligibility are injected for tests.
export function createAutoSave({save,eligible,onError=()=>{},now=()=>Date.now(),interval=600000,retry=30000}){
    let requested=0,completed=0,lastSuccess=now(),lastAttempt=-Infinity,busy=false,generation=0;
    return {
        request(){requested++;},
        reset(){generation++;requested=completed=0;lastSuccess=now();lastAttempt=-Infinity;},
        async tick(){
            const time=now();
            if(busy||!eligible()||time-lastAttempt<retry||requested===completed&&time-lastSuccess<interval)return false;
            const captured=requested,epoch=generation;busy=true;lastAttempt=time;
            try{await save();if(epoch===generation){completed=captured;lastSuccess=now();}return true;}
            catch(error){if(epoch===generation){requested=Math.max(requested,completed+1);onError(error);}return false;}
            finally{busy=false;}
        },
    };
}
