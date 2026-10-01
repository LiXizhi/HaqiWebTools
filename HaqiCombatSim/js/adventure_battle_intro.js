import {battleIntroRoster,battleIntroFrame} from './battle_intro_core.js';
import {createBattleIntroView} from './view_battle_intro.js';

// The app owns the battle; this disposable session only gates its initial presentation.
export function createBattleIntro({root,onDone,viewFactory=createBattleIntroView,now=()=>performance.now(),reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches}){
    let session=null;
    const view=viewFactory(root,{skip:finish});
    function close(){if(!session)return;session=null;view.close();}
    function finish(){const s=session;if(!s)return;close();onDone(s.battle);}
    return {
        get active(){return !!session;},
        open(battle,assets){
            close();void assets.warmBattle?.(battle)?.catch(()=>{});const roster=battleIntroRoster(battle);
            if(!roster.length){onDone(battle);return;}
            session={battle,roster,reduced:reducedMotion(),elapsed:0,last:now()};
            view.open({roster,assets,reduced:session.reduced});
            view.update(battleIntroFrame(0,roster.length,session.reduced));
        },
        tick(time,{paused=false}={}){
            const s=session;if(!s)return;
            const dt=s.last===null?0:Math.max(0,Math.min(100,time-s.last));s.last=paused?null:time;
            if(paused)return;
            s.elapsed+=dt;
            const frame=battleIntroFrame(s.elapsed,s.roster.length,s.reduced);
            if(frame.done){finish();return;}
            view.update(frame);
        },
        suspend(){if(session)session.last=null;},
        skip:finish,close,
    };
}
