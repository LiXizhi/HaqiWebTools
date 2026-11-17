// Shared by all speech clients; tokens never change the user's sound preference.
const tokens=new Set(),listeners=new Set();
export function audioActivityActive(){return tokens.size>0;}
export function subscribeAudioActivity(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
export function acquireAudioActivity(){
    const token={};tokens.add(token);for(const fn of listeners)fn(true);
    let released=false;
    return ()=>{if(released)return;released=true;tokens.delete(token);for(const fn of listeners)fn(tokens.size>0);};
}
