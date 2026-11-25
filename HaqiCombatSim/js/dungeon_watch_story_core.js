// Read-only connective scenes. Battles, evidence and rewards keep their own records.
import {dungeonTacticsProfile} from './dungeon_tactics_core.js';

const SCENES=[
 {id:'S1194-W00',title:'雾里的第一盏灯',line:'雾把前面的道路遮住了。茜茜停在灯旁，没有催你向前。',reply:'茜茜：先看清对手准备做什么。走累了就告诉我，我们可以回去。'},
 {id:'S1194-W01',title:'灯光照出第二段路',line:'第一处营地安静下来。更远处传来盾牌相碰的声音，灯光只照亮脚边的一小段路。',reply:'茜茜：下一处的对手会保护自己。别急，我们先看它的盾。'},
 {id:'S1194-W02',title:'风把灯影拉长了',line:'第二处营地已经通过。前方的灯影在风里摇晃，茜茜回头确认你还在。',reply:'茜茜：你跟上了。下一处要留意虚弱，先看看自己的状态再出手。'},
 {id:'S1194-W03',title:'最后一段巡夜路',line:'第三处营地已经通过。最后一处灯台就在道路尽头，对手正在那里准备。',reply:'茜茜：还有最后一段。它会强化、布置陷阱，再发起攻击；我们先看清准备过程。'},
 {id:'S1194-W04',title:'一起走完的巡夜路',line:'四处营地都已通过。来时看不清的道路，如今一段一段连在了身后。',reply:'茜茜：我们都走到这里了。回营地歇一歇，再把这趟巡逻的经过说清楚。'},
];

export function dungeonWatchStory(save,dungeon,clearedIds=[]){
 if(dungeon?.id!=='journey:first-watch'||dungeon.arenas?.length!==4)return null;
 const cleared=new Set(clearedIds);
 const firstRemaining=dungeon.arenas.findIndex(arena=>!cleared.has(arena.id));
 const stage=firstRemaining<0?4:firstRemaining;
 const tactics=dungeonTacticsProfile(dungeon);
 const plan=save.forestCommission?.plan;
 return {...SCENES[stage],stage,complete:stage===4,nextIndex:stage<4?stage:null,
  tip:stage<4?tactics?.steps?.[stage]||null:null,
  remembered:plan==='tracks'?'你们约好沿路留意脚印；巡逻结束后，再回营地核对线索。':plan==='light'?'你们约好先守好巡夜灯；巡逻结束后，再回营地核对线索。':null};
}

const RETRY_REPLIES=[
 '茜茜：这一处的对手会先强化，再发起攻击。下一次，我们留意它准备重击的回合。',
 '茜茜：它加盾之后还会连续进攻。下一次，先看盾还在不在，再安排主攻。',
 '茜茜：虚弱还在时，主攻也会受影响。下一次，先看看自己身上的状态。',
 '茜茜：它会先强化、布置陷阱，再攻击。下一次，我们把准备的回合也算进去。',
];

export function dungeonWatchRetryStory(save,dungeon,battle){
 if(!battle?.finished||battle.winner!=='far'||battle.redMushroom||battle.tacticsField)return null;
 const checkpoint=save.pendingEncounter;
 if(save.zone!=='journey:first-watch'||dungeon?.id!==save.zone||dungeon.kind!=='elite'||dungeon.arenas?.length!==4||checkpoint?.dungeonTacticsId!==dungeon.id||checkpoint.dungeonTacticsVersion!==2)return null;
 const stage=dungeon.arenas.findIndex(arena=>arena.id===checkpoint.encounterId);
 if(stage<0)return null;
 return {id:`S1194-R0${stage+1}`,wave:stage+1,reply:RETRY_REPLIES[stage],tip:dungeonTacticsProfile(dungeon).steps[stage],
  recovery:'副本内不会自动恢复生命。需要休息时，可以先离开副本，到岛上恢复，再回来继续。',
  progress:'已通过的营地会保留；重新开启副本会清空本轮进度。'};
}
