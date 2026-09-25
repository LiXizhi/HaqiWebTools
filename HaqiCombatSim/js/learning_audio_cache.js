// Compatibility for CDN SDK versions predating synthesizeCached. Completed TTS only.
const entries=new Map();
const MAX_BYTES=20*1024*1024,MAX_ENTRIES=100;
export function cachedLearningAudio(key){
    const blob=entries.get(key);if(blob){entries.delete(key);entries.set(key,blob);}return blob;
}
export function rememberLearningAudio(key,blob){
    if(!(blob instanceof Blob)||!blob.size||blob.size>MAX_BYTES)return;
    entries.delete(key);entries.set(key,blob);
    let bytes=[...entries.values()].reduce((n,b)=>n+b.size,0);
    while(entries.size>MAX_ENTRIES||bytes>MAX_BYTES){const first=entries.keys().next().value;bytes-=entries.get(first).size;entries.delete(first);}
}
