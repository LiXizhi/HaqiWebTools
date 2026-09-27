// Presentation recipes only. No combat RNG or state changes.
const tone=(frequency,end=frequency,duration=.12,delay=0,gain=.09,noise=0)=>({frequency,end,duration,delay,gain,noise,wave:'sine',filter:2400});
const chime=(notes,duration=.2)=>notes.map((n,i)=>tone(n,n,duration,i*.09));
export function gameSoundRecipe(name){
    const recipes={
        click:[tone(620,780,.055,0,.055)],open:[tone(360,640,.13)],close:[tone(540,320,.1)],
        select:[tone(740,960,.09)],discard:[tone(400,220,.12,0,.07,.15)],
        hit:[tone(140,65,.18,0,.11,.24)],heal:chime([660,880]),shield:[tone(440,700,.22,0,.1,.04)],
        fizzle:[tone(200,85,.22,0,.08,.1)],capture:chime([523,659,784]),miss:[tone(330,220,.2)],
        victory:chime([523,659,784,1047],.32),defeat:chime([392,330,262],.3),
        level:chime([523,659,784,1047],.35),quest:chime([659,784,988]),reward:chime([784,988],.17),
        purchase:chime([880,1175],.12),equip:[tone(480,700,.15,0,.08,.08)],
        teleport:[tone(260,1040,.42,0,.09,.05)],splash:[tone(260,100,.26,0,.07,.35)],
        catch:chime([660,880,1100],.16),feed:[tone(320,480,.12),tone(480,600,.12,.13)],
        friendship:chime([660,830,990],.16),adopt:chime([523,784,1047],.22),
    };
    const cues=recipes[name];
    if(!cues)return null;
    return {cues,priority:['victory','defeat','level','quest','capture','adopt'].includes(name)?3:['reward','catch','friendship','purchase'].includes(name)?2:['click','open','close','select','discard'].includes(name)?0:1};
}
export function rewardSound(event,action=''){
    if(event.level)return 'level';
    if(['claim','claim-catalog'].includes(action))return 'quest';
    if(['buy','npc-purchase'].includes(action))return 'purchase';
    if(['equip','unequip','ride','dismount','upgrade','deck','choose-totem'].includes(action))return 'equip';
    if(['feed','pet-feed'].includes(action))return 'feed';
    if(event.items?.length||event.xp>0)return 'reward';
    return null;
}
// Cast recipes already contain their impact sound. Only independent effects need a cue.
export function battleEventSound(events,index){
    const event=events[index];
    if(!event)return null;
    if(event.type==='combat_end')return event.winner==='near'?'victory':'defeat';
    if(event.type==='capture')return event.success?'capture':'miss';
    if(!['damage','heal','status'].includes(event.type))return null;
    if(!event.periodic){
        for(let i=index-1;i>=0;i--){
            if(['cast','fizzle'].includes(events[i].type))return null;
            if(['movearrow','pass'].includes(events[i].type))break;
        }
    }
    return event.type==='damage'?'hit':event.type==='heal'?'heal':'shield';
}
