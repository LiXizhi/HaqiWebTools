import {pickBattleTarget} from './battle_target_pick_core.js';

// Shared live event binding, also exercised by the fast Node integration suite.
export function bindBattleTargeting(canvas,onTarget){
    canvas.onclick=event=>{
        const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
        const point={x:(event.clientX-rect.left)*canvas.clientWidth/rect.width,y:(event.clientY-rect.top)*canvas.clientHeight/rect.height};
        const id=pickBattleTarget(canvas.battleTargetRects||[],canvas.battlePositions||{},point);
        if(id)onTarget(id);
    };
}
