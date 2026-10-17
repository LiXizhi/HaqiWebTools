// Entry-only gate. Normal walking continues to stream terrain without a modal.
export function createIslandSceneLoading({warm,prepare,show,hide,onStart=()=>{},onReady=()=>{},timeout=30000}){
    let current=null,completedWorld=null,completedSave=null;
    function cancel(){current=null;hide();}
    function retry(){current=null;}
    function update(world,save,now,enabled=true){
        if(!enabled||!world?.layout||world.isEarth||world.isCityDungeon){if(current)cancel();return false;}
        if(world===completedWorld&&save===completedSave){if(current)cancel();return false;}
        if(!current||current.world!==world||current.save!==save){
            const row={world,save,started:now,warmed:false,error:null};current=row;
            onStart();show({phase:'assets'});
            Promise.resolve().then(()=>current===row?warm(world,save):null).then(()=>{if(current===row)row.warmed=true;},()=>{if(current===row)row.error='场景资源暂时未能加载，请重试。';});
            return true;
        }
        const row=current;
        if(!row.error&&now-row.started>=timeout)row.error='场景准备时间较长，可以重试或返回。';
        if(row.error){show({phase:'error',message:row.error});return true;}
        if(!row.warmed)return true;
        try{
            const progress=prepare(world,save);
            if(progress&&progress.ready===progress.total){completedWorld=world;completedSave=save;current=null;hide();onReady();return false;}
            show({phase:'terrain',ready:progress?.ready||0,total:progress?.total||0});
        }catch{row.error='地形暂时未能准备完成，请重试。';show({phase:'error',message:row.error});}
        return true;
    }
    return {update,cancel,retry,get active(){return current!==null;}};
}
