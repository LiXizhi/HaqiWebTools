// Presentation-only sound recipes, independent of the battle RNG and browser IO.
import {spellEffect} from './spell_effects_core.js';
const schools={ice:[880,'sine',2600],fire:[130,'triangle',900],storm:[190,'sawtooth',1800],life:[660,'sine',3200],death:[95,'triangle',550],balance:[440,'sine',1600]};
export function spellSoundCues(config,card,{failed=false,reducedMotion=false}={}) {
    const spec=spellEffect(config,card),[frequency,wave,filter]=schools[card.spellSchool];
    if(failed)return [{at:0,frequency:180,end:60,wave:'triangle',noise:.12,filter:600,duration:.24,gain:.12}];
    if(spec.kind==='pass')return [];
    const kind=spec.kind==='summon'?spec.attack:spec.kind;
    const supportive=spec.friendly||['heal','shield','absorb','reflect','cleanse','pips'].includes(kind);
    const attack=spec.kind==='summon'?config.timeline.summonAttack:config.timeline.attack;
    const impact=spec.kind==='summon'?config.timeline.summonImpact:config.timeline.impact;
    const cues=[
        {at:0,frequency:frequency*.6,end:frequency,wave,noise:.025,filter,duration:.24,gain:.1},
        {at:attack,frequency,end:frequency*(supportive?1.5:.55),wave,noise:supportive?.04:.2,filter,duration:.28,gain:.13},
        {at:impact,frequency:supportive?frequency*1.5:frequency*.7,end:supportive?frequency*2:Math.max(45,frequency*.2),wave,noise:supportive?.015:['meteor','lightning','vortex'].includes(kind)?.4:.18,filter,duration:kind==='meteor'?.48:.32,gain:.18}
    ];
    if(kind==='swords')for(let i=1;i<4;i++)cues.push({...cues[1],at:attack+(impact-attack)*i/5,frequency:frequency*(1+i*.14),duration:.1,gain:.055});
    if(kind==='heal'||kind==='pips')for(let i=1;i<3;i++)cues.push({...cues[2],at:impact+(1-impact)*i/3,frequency:frequency*(1.5+i*.25),duration:.25,gain:.075});
    if(kind==='drain'||spec.secondary==='heal')cues.push({...cues[0],at:impact+(1-impact)*.5,frequency:frequency*.5,end:frequency*1.5,duration:.3,gain:.12});
    return reducedMotion?[{...cues[0],gain:.08,duration:.16}]:cues.sort((a,b)=>a.at-b.at);
}

// Seek/resume do not replay missed cues; loop boundaries start a new cast.
export function crossedSoundCues(cues,previous,current) {
    if(previous===null||current-previous>.25)return [];
    const start=current<previous?-.001:previous;
    return cues.filter(cue=>cue.at>start&&cue.at<=current);
}
