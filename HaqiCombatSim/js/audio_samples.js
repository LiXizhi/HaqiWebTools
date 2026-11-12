import {fetchJson} from './runtime_data.js';

export const sampleNames=Object.freeze({click:'click_003',open:'open_001',close:'close_001',select:'select_002',discard:'bookFlip1',hit:'chop',heal:'glass_002',shield:'glass_002',fizzle:'error_002',miss:'error_002',victory:'confirmation_002',defeat:'error_002',level:'confirmation_002',quest:'confirmation_002',reward:'handleCoins',purchase:'handleCoins',equip:'cloth1',teleport:'glass_002',capture:'confirmation_002',catch:'confirmation_002',feed:'cloth1',friendship:'confirmation_002',adopt:'confirmation_002',cast:'bookFlip1',release:'knifeSlice'});

// Optional cache; first gesture unlocks WebAudio without waiting for the network.
// Each file is bounded, decoded once, and never turns failure into a replay later.
export function createAudioSamples({read=fetchJson,fetcher=globalThis.fetch,mode=()=>new URLSearchParams(globalThis.location?.search||'').get('assets')==='local'?'local':'cdn'}={}){
    let loading=null,disposed=false;const buffers=new Map(),controllers=new Set();
    async function load(context){
        if(disposed||typeof context?.decodeAudioData!=='function')return;
        if(loading)return loading;
        loading=(async()=>{
            const manifest=await read('data/adventure/audio-samples.json');
            const entries=Object.entries(manifest.assets||{});let cursor=0;
            async function worker(){while(cursor<entries.length&&!disposed){const [id,row]=entries[cursor++];const url=mode()==='local'?new URL('../'+row.local,import.meta.url).href:row.cdn;if(!url||mode()!=='local'&&!url.startsWith('https://cdn.keepwork.com/'))continue;
                const control=new AbortController();controllers.add(control);const timer=setTimeout(()=>control.abort(),8000);
                try{const response=await fetcher(url,{signal:control.signal});if(!response.ok)throw Error('audio request failed');const data=await response.arrayBuffer();if(data.byteLength>500000)throw Error('audio sample too large');const buffer=await context.decodeAudioData(data);if(!disposed&&buffer.duration<=5)buffers.set(id,buffer);}catch{/* An optional sample never blocks gameplay. */}finally{clearTimeout(timer);controllers.delete(control);}
            }}
            await Promise.all([worker(),worker(),worker()]);
        })().catch(()=>{});
        return loading;
    }
    return{load,get:name=>buffers.get(sampleNames[name]),get count(){return buffers.size;},dispose(){disposed=true;for(const control of controllers)control.abort();controllers.clear();buffers.clear();}};
}
