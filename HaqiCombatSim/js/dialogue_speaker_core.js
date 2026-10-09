// Voice IDs verified against KeepworkSDK src/audio/SpeechVoices.ts.
// Ages are casting brackets, not provider age guarantees. The SDK has no
// dedicated girl/elder voice; use its existing feminine/mature voices.
const voices={
    male:['zh_male_tiancaitongsheng_mars_bigtts','zh_male_yangguangqingnian_moon_bigtts','zh_male_shenyeboke_moon_bigtts','zh_male_jieshuonansheng_mars_bigtts'],
    female:['zh_female_qingxinnvsheng_mars_bigtts','zh_female_yuanqinvyou_moon_bigtts','zh_female_cancan_mars_bigtts','zh_female_qinqienvsheng_moon_bigtts'],
};
export function dialogueSpeaker(source={}){
    const sex=source.sex||source.gender||({boy:'male',girl:'female'}[source.appearance]);
    return {sex:sex==='female'?'female':'male',age:Number.isInteger(source.age)&&source.age>=1&&source.age<=80?source.age:25};
}
export function selectDialogueVoice(source,supported){
    const {sex,age}=dialogueSpeaker(source),index=age<=12?0:age<=20?1:age<=45?2:3;
    // The hero has no age field: select a normal male/female voice by appearance.
    const preferred=voices[sex][source.appearance&&!source.age?1:index];
    if(!supported?.length||supported.some(v=>v.id===preferred))return preferred;
    const fallback=supported.find(v=>v.id.includes(`_${sex}_`));
    if(!fallback)throw Error('当前语音服务没有与角色性别匹配的音色');
    return fallback.id;
}
