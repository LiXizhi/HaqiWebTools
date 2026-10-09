import {findPath} from './adventure_world_core.js';
import {findPetMeeting,petMeetingPath} from './adventure_pet_meeting_core.js';
let world=null;
self.onmessage=({data})=>{
    if(data.type==='scene'){world=data.world;return;}
    try{if(data.type==='meeting')self.postMessage({id:data.id,anchor:findPetMeeting(world,data.participants,data.owners,data.content)});
        else self.postMessage({id:data.id,path:data.type==='meeting-path'?petMeetingPath(world,data.from,data.to):findPath(world,data.from,data.to)});}
    catch(error){self.postMessage({id:data.id,error:String(error)});}
};
