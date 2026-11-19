import fs from 'node:fs';
import {installExpansion} from '../../js/adventure_expansion_core.js';
import {createTacticsChallenge} from '../../js/tactics_challenge_core.js';
import {playPveRound} from '../../js/combat_pve_core.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../../data/'+f,import.meta.url)));
const {dataset,content}=installExpansion(...['adventure/chapter.json','adventure/combat.json','adventure/pets.json','adventure/shop-candidates.json','kids/cards.json','kids/charms.json'].map(read));
const counts={},traces=[];
for(const school of ['fire','ice','storm','life','death'])for(const seed of [17,1009,1010]){
 const a=createTacticsChallenge(dataset,content,{id:'elite',school,seed});
 if(process.env.TACTICAL_FOCUS_FREE==='false')a.resolved.tacticalEncounter.focusFreeAttack=false;
 while(!a.finished&&a.turn<=12)playPveRound(a,{pass:true});
 const rows=a.events.filter(e=>e.type==='tactic_resolution').map(e=>({turn:e.turn,caster:e.caster,key:e.key,targetId:e.targetId,pips:e.pips,effect:e.effect,outcome:e.outcome}));
 for(const row of rows){const key=row.caster+':'+row.effect+':'+row.outcome;counts[key]=(counts[key]||0)+1;}
 traces.push({school,seed,handSize:a.resolved.global.handSize,turns:a.turn,winner:a.winner,rows});
}
console.log(JSON.stringify({method:'15 formal elite battles; player passes, native companion AI; at most 12 turns; no stat edits',counts,traces}));
