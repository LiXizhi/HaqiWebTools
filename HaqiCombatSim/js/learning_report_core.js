// Local learning achievements only; unrelated to rewards, entitlement or cloud saves.
export function reportDay(now=Date.now()) {const d=new Date(now);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function learnedWords(state){return Object.entries(state?.languages?.en?.entries||{}).filter(([,entry])=>entry?.learned===true).map(([id])=>id);}
export function updateLearningReport(before,state,now=Date.now()){
    const report=state.learningReport||={startedAt:now,days:{}};
    const known=new Set(before),added=learnedWords(state).filter(id=>!known.has(id)&&!state.languages.en.entries[id].imported).length;
    if(added){const day=report.days[reportDay(now)]||={words:0,speaking:0};day.words+=added;}
    const cutoff=reportDay(now-400*86400000);for(const day of Object.keys(report.days))if(day<cutoff)delete report.days[day];
}
export function recordSpeakingPractice(state,now=Date.now()){
    const report=state.learningReport||={startedAt:now,days:{}};
    const day=report.days[reportDay(now)]||={words:0,speaking:0};day.speaking++;
    report.speakingTotal=(report.speakingTotal||0)+1;
}
export function learningReport(state,now=Date.now()){
    const today=reportDay(now),start=new Date(now);start.setDate(start.getDate()-(start.getDay()+6)%7);
    const weekStart=reportDay(start),monthStart=today.slice(0,7)+'-01',week={words:0,speaking:0},month={words:0,speaking:0};
    for(const [date,row] of Object.entries(state?.learningReport?.days||{})){
        if(date>today)continue;
        for(const [period,start] of [[week,weekStart],[month,monthStart]])if(date>=start){period.words+=row.words||0;period.speaking+=row.speaking||0;}
    }
    return {words:learnedWords(state).length,speaking:state?.learningReport?.speakingTotal||0,week,month};
}
export function learningReportMarkdown(state,now=Date.now()){
    const r=learningReport(state,now);
    return `累计学会 **${r.words}** 个单词，开口 **${r.speaking}** 次\n- 本周：新学 **${r.week.words}** 词 · 开口 **${r.week.speaking}** 次\n- 本月：新学 **${r.month.words}** 词 · 开口 **${r.month.speaking}** 次\n每一次开口，都是进步。\n本机当前角色 · 自启用统计起`;
}
