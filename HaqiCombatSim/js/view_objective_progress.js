// Read-only projection of real objective counts. It never advances a quest.
const previousBySave=new WeakMap();
export function objectiveProgress(save,id,value,total){
 const safeTotal=Math.max(1,Number(total)||1),current=Math.max(0,Math.min(safeTotal,Number(value)||0));
 let cache=previousBySave.get(save);if(!cache){cache=new Map();previousBySave.set(save,cache);}
 const previous=cache.get(id);cache.set(id,current/safeTotal);
 const box=document.createElement('div');box.className='objective-progress';box.setAttribute('role','progressbar');box.setAttribute('aria-label','当前目标进度');box.setAttribute('aria-valuemin','0');box.setAttribute('aria-valuemax',String(safeTotal));box.setAttribute('aria-valuenow',String(current));
 const bar=document.createElement('span');bar.className='objective-progress-fill';bar.style.transform=`scaleX(${previous??current/safeTotal})`;box.append(bar);
 if(previous!==undefined&&previous!==current/safeTotal){requestAnimationFrame(()=>{if(box.isConnected)bar.style.transform=`scaleX(${current/safeTotal})`;});if(current===safeTotal){const mark=document.createElement('span');mark.className='objective-progress-check';mark.textContent='✓';mark.setAttribute('aria-hidden','true');box.append(mark);}}
 return box;
}
