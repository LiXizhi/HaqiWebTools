// prologue_script_core.js — pure script model for the prologue 《失落的光》. No DOM.
// The caller supplies time; nothing here starts timers.

export const LOCALES=['zh-CN','en'];
export const BEAT_TYPES=['art','fx','title','line','battle-scripted','catch-spark','choose-school','hanzi','card-forge','battle-live','end'];
export const FX=['word-leaves','darken','shatter','dawn'];
export const MOVES=['push-in','pull-out','pan-left','pan-right','still'];
export const SCHOOL_IDS=['fire','ice','storm','life','death'];
const INTERACTIVE=new Set(['battle-scripted','catch-spark','choose-school','hanzi','card-forge','battle-live','end']);

const isText=v=>v&&typeof v==='object'&&LOCALES.every(id=>typeof v[id]==='string'&&v[id].trim());
/** Throws on anything the stage would not know how to play. Returns the script. */
export function validateScript(script,{artIds=null}={}){
    const fail=message=>{throw Error(`序章剧本无效：${message}`);};
    if(script?.version!==1||!Array.isArray(script.scenes)||!script.scenes.length)fail('版本或场景');
    if(!isText(script.title))fail('标题');
    const speakers=script.speakers||{};
    for(const [id,s] of Object.entries(speakers))if(!isText(s))fail(`角色名 ${id}`);
    const ids=new Set();
    const checkLine=(line,where)=>{if(!speakers[line?.speaker])fail(`${where} 未知角色 ${line?.speaker}`);if(!isText(line.text))fail(`${where} 缺少双语文字`);};
    for(const scene of script.scenes){
        if(typeof scene.id!=='string'||ids.has(scene.id))fail(`场景编号 ${scene.id}`);ids.add(scene.id);
        if(!Array.isArray(scene.beats)||!scene.beats.length)fail(`${scene.id} 没有镜头`);
        scene.beats.forEach((beat,i)=>{
            const where=`${scene.id}#${i}`;
            if(!BEAT_TYPES.includes(beat.type))fail(`${where} 未知类型 ${beat.type}`);
            if(beat.type==='line')checkLine(beat,where);
            if(beat.type==='title'&&!isText(beat.text))fail(`${where} 标题`);
            if(beat.type==='fx'&&!FX.includes(beat.name))fail(`${where} 未知特效 ${beat.name}`);
            if(beat.type==='art'){if(beat.move&&!MOVES.includes(beat.move))fail(`${where} 镜头运动`);if(artIds&&!artIds.has(beat.art))fail(`${where} 缺少美术 ${beat.art}`);}
            if(['battle-scripted','battle-live'].includes(beat.type)){
                if(artIds&&beat.art&&!artIds.has(beat.art))fail(`${where} 缺少美术 ${beat.art}`);
                for(const [key,lines] of Object.entries(beat.lines||{})){if(!Array.isArray(lines))fail(`${where} ${key}`);lines.forEach(l=>checkLine(l,`${where}.${key}`));}
            }
            if(beat.type==='catch-spark'&&!isText(beat.prompt))fail(`${where} 提示`);
            if(beat.type==='choose-school'&&beat.deathNote)checkLine(beat.deathNote,`${where}.deathNote`);
            if(beat.type==='hanzi'&&(!beat.page||!beat.entryId||!beat.wordCard?.['zh-CN']||!beat.wordCard?.en||!beat.reveal?.glyph))fail(`${where} 汉字镜头`);
            if(beat.type==='end'&&(!isText(beat.text)||!isText(beat.action)))fail(`${where} 结尾`);
            if(beat.autoSeconds!==undefined&&!(Number.isFinite(beat.autoSeconds)&&beat.autoSeconds>=0))fail(`${where} 自动继续时间`);
        });
    }
    return script;
}

/** UI language and the second language shown under it. v1 pairs zh-CN and en. */
export function languagePair(native,second){
    const n=native==='en'?'en':'zh-CN';
    const t=LOCALES.includes(second)&&second!==n?second:(n==='en'?'zh-CN':'en');
    return {native:n,target:t};
}
/** Both lines of a bilingual text, native first. */
export function bilingual(text,pair){
    return {primary:text?.[pair.native]||text?.['zh-CN']||'',secondary:text?.[pair.target]||''};
}

/** Parses Haqi.html?prologue[&lang=en][&second=zh-CN][&scene=light][&assets=local]. Null when absent. */
export function prologueRequested(search){
    const q=new URLSearchParams(search||'');
    if(!q.has('prologue'))return null;
    const lang=q.get('lang'),second=q.get('second'),scene=q.get('scene');
    return {lang:LOCALES.includes(lang)?lang:null,second:LOCALES.includes(second)?second:null,scene:scene&&/^[a-z0-9-]{1,40}$/.test(scene)?scene:null};
}

/** Reading time for auto-continue: brisk enough for fast pacing, long enough to read or tap through. */
export function readSeconds(text,pair){
    const {primary,secondary}=bilingual(text,pair);
    const units=[...primary].length*(pair.native==='en'?0.04:0.12)+[...secondary].length*(pair.target==='en'?0.02:0.06);
    return Math.max(2.4,Math.min(7.5,1.4+units));
}
export function beatAutoSeconds(beat,pair){
    if(beat.type==='line')return readSeconds(beat.text,pair);
    if(beat.type==='title')return 1.8;
    if(beat.type==='art')return 0;
    if(beat.type==='fx')return 0;
    if(INTERACTIVE.has(beat.type))return beat.autoSeconds??0;
    return 0;
}
export function isInteractive(beat){return INTERACTIVE.has(beat.type);}

/** Flat cursor over scenes/beats with skip and jump. State only; the stage plays each beat. */
export function createRunner(script,{start=null}={}){
    const flat=[];
    script.scenes.forEach((scene,s)=>scene.beats.forEach((beat,b)=>flat.push({scene:scene.id,sceneIndex:s,beatIndex:b,beat})));
    let index=0;
    if(start){const at=flat.findIndex(x=>x.scene===start);if(at<0)throw Error(`序章没有场景：${start}`);index=at;}
    const sceneStart=s=>flat.findIndex(x=>x.sceneIndex===s);
    return {
        get index(){return index;},
        get length(){return flat.length;},
        get done(){return index>=flat.length;},
        current:()=>flat[index]||null,
        next(){if(index<flat.length)index++;return flat[index]||null;},
        skipScene(){const cur=flat[index];if(!cur)return null;const next=sceneStart(cur.sceneIndex+1);index=next<0?flat.length:next;return flat[index]||null;},
        /** Skip to the final scene so the call to action stays visible. */
        skipAll(){index=sceneStart(script.scenes.length-1);index=flat.findIndex((x,i)=>i>=index&&x.beat.type==='end');if(index<0)index=flat.length;return flat[index]||null;},
        jump(sceneId){const at=flat.findIndex(x=>x.scene===sceneId);if(at<0)throw Error(`序章没有场景：${sceneId}`);index=at;return flat[index];},
        /** Most recent art beat at or before the cursor, so a jump can restore the backdrop. */
        artAt(i=index){for(let k=Math.min(i,flat.length-1);k>=0;k--){const b=flat[k].beat;if(b.type==='art')return b;if(['battle-scripted','battle-live'].includes(b.type)&&b.art)return {type:'art',art:b.art,move:'still'};}return null;},
        scenes:script.scenes.map(s=>s.id),
    };
}
/** Total estimated runtime with auto-continue (interactive beats at their auto time). */
export function estimateSeconds(script,pair,{battleSeconds=60,hanziSeconds=120}={}){
    let total=0;
    for(const scene of script.scenes)for(const beat of scene.beats){
        if(beat.type==='battle-scripted'||beat.type==='battle-live')total+=battleSeconds;
        else if(beat.type==='hanzi')total+=hanziSeconds;
        else if(beat.type==='art')total+=0.8;
        else total+=beatAutoSeconds(beat,pair)||1.5;
    }
    return total;
}
