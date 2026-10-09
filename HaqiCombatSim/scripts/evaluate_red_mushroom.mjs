// Reproducible beginner matchmaking probe. Not a promise of human win rates.
import fs from 'node:fs';
import {installExpansion} from '../js/adventure_expansion_core.js';
import {createAdventure} from '../js/adventure_core.js';
import {arenaSeats,arenaDifficulty,emptyArenaRecord,beginArenaRecord,finishArenaRecord,startRedMushroom,playRedMushroom} from '../js/adventure_red_mushroom_core.js';
import {SimpleBot} from '../js/combat_policy_core.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(`../data/${p}.json`,import.meta.url)));
const {content,dataset}=installExpansion(read('adventure/chapter'),read('adventure/combat'),read('adventure/pets'),read('adventure/shop-candidates'),read('kids/cards'),read('kids/charms'));
for(const school of ['fire','ice','storm','life','death']){
    const save=createAdventure(content,{school}),seats=arenaSeats(save,content,dataset,[],1),bot=new SimpleBot();
    const play=(record,seed)=>{
        const match=startRedMushroom(dataset,seats,1,seed,arenaDifficulty(record,'today',seed));
        while(!match.arena.finished)playRedMushroom(match,bot.pick(match.arena,match.arena.unitsById.hero));
        return match.arena.winner==='near'?'win':match.arena.winner==='far'?'loss':'draw';
    };
    let record=emptyArenaRecord(),firstWins=0;
    for(let i=0;i<100;i++){
        const result=play(record,i+1);
        record=finishArenaRecord(beginArenaRecord(record,{id:String(i),day:'today',mode:1}),String(i),result);
    }
    for(let i=0;i<20;i++)if(play(emptyArenaRecord(),500+i)==='win')firstWins++;
    console.log(JSON.stringify({school,games:100,wins:record.wins,draws:record.draws,losses:record.losses,recentWins:record.recent.filter(x=>x.result==='win').length,firstGames:20,firstWins}));
}
