// Declarative film timeline. No browser, storage or game state dependencies.
export function compileFilm(script, edition = 'long') {
    if (script.version !== 1 || !Array.isArray(script.shots)) throw Error('剧本版本不受支持');
    const ids = new Set(); let start = 0;
    const shots = script.shots.flatMap(shot => {
        if (!shot.id || ids.has(shot.id)) throw Error('镜头编号必须唯一');
        ids.add(shot.id);
        const duration = shot.duration?.[edition];
        if (duration === 0) return [];
        if (!Number.isFinite(duration) || duration <= 0) throw Error('镜头时长无效');
        if (!shot.subtitle?.['zh-CN'] || !shot.title?.['zh-CN']) throw Error('镜头缺少中文字幕');
        const cues = (shot.cues || []).map(cue => {
            if (!Number.isFinite(cue.at) || cue.at < 0 || cue.at >= 1 || !cue.action) throw Error('镜头动作无效');
            return {...cue, time: cue.at * duration};
        }).sort((a, b) => a.time - b.time);
        const result = {...shot, start, duration, cues}; start += duration; return [result];
    });
    if (!shots.length) throw Error('剧本没有镜头');
    return {shots, duration: start, edition};
}
export function locateShot(film, time) {
    const clamped = Math.max(0, Math.min(Number.isFinite(time) ? time : 0, film.duration));
    const index = Math.max(0, film.shots.findLastIndex(shot => shot.start <= clamped));
    return {index, shot: film.shots[index], elapsed: clamped - film.shots[index].start, time: clamped};
}
export function filmText(values, language) { return values?.[language] || values?.['zh-CN'] || ''; }
export function captionAt(shot,elapsed,language){
    const cue=shot.cues.findLast(c=>c.caption&&c.time<=elapsed);
    return filmText(cue?.caption||shot.subtitle,language);
}
// A RAF timestamp can predate the completion of an asynchronous scene load.
export function frameDelta(now, previous, speed=1) { return Math.max(0, Math.min(.1, (now-previous)/1000))*speed; }
// Let the current action animate, but hold before the next action/caption or shot
// until both synthesis and audio playback have finished. No wall time catch-up.
export function narrationLimitedTime(film,time,delta,cueIndex,pending){
    const target=Math.min(film.duration,time+delta);
    if(!pending)return target;
    const {shot}=locateShot(film,time);
    const boundary=shot.start+(shot.cues[cueIndex]?.time??shot.duration);
    return Math.min(target,Math.max(time,boundary-.001));
}
export function srtFor(film, language) {
    const stamp = seconds => new Date(Math.round(seconds * 1000)).toISOString().slice(11, 23).replace('.', ',');
    const rows=film.shots.flatMap(shot=>{
        const beats=[{time:0,caption:shot.subtitle},...shot.cues.filter(c=>c.caption)];
        return beats.map((beat,i)=>({start:shot.start+beat.time,end:shot.start+(beats[i+1]?.time??shot.duration),text:filmText(beat.caption,language)})).filter(row=>row.end>row.start);
    });
    return rows.map((row,i)=>`${i+1}\n${stamp(row.start)} --> ${stamp(row.end)}\n${row.text}\n`).join('\n');
}
