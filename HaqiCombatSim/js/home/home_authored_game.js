import {homeTargetGames} from './home_target_games.js';
import {validateAuthoredHomeGames} from '../home_authored_game_core.js';
let source;
export async function loadAuthoredHomeGames(index){
    if(index.language!=='en')return homeTargetGames(index);
    source??=fetch(new URL('../../data/adventure/curriculum/english-home-practice.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('家园故事暂时无法读取');return r.json();}).catch(error=>{source=null;throw error;});
    return validateAuthoredHomeGames(await source,index);
}
