const revealing=new WeakMap();
export function waitForDialogueReveal(node){return revealing.get(node)?.promise||Promise.resolve();}
function complete(row){row.animate=false;const pending=revealing.get(row.node);revealing.delete(row.node);pending?.resolve();}

// One reveal sequence: original text first, then its native-language translation.
export function createDialogueReveal({reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??true,stepMs=22,onUpdate=()=>{}}={}){
    let timer=null,rows=[];
    function finish(){const changed=rows.length>0;clearTimeout(timer);timer=null;for(const row of rows){if(row.animate)row.node.textContent=row.text;if(row.translation)row.translation.hidden=false;if(row.container)row.container.hidden=false;complete(row);}rows=[];if(changed)onUpdate();}
    function start(nodes){finish();rows=nodes.filter(Boolean).map(value=>value.node?value:{node:value}).map(({node,translation,container})=>({node,translation,container,text:node.textContent,chars:Array.from(node.textContent||''),animate:!node.childElementCount}));
        for(const row of rows){let resolve;const promise=new Promise(done=>resolve=done);revealing.set(row.node,{promise,resolve});}
        if(reduced()){finish();return;}
        for(const row of rows){if(row.animate)row.node.textContent='';if(row.translation)row.translation.hidden=true;if(row.container)row.container.hidden=true;}let index=0,count=0;
        function tick(){const row=rows[index];if(!row){timer=null;rows=[];return;}if(row.container)row.container.hidden=false;count=row.animate?Math.min(row.chars.length,count+Math.max(1,Math.ceil(row.chars.length/65))):row.chars.length;if(row.animate)row.node.textContent=row.chars.slice(0,count).join('');if(count===row.chars.length){if(row.translation)row.translation.hidden=false;complete(row);index++;count=0;}onUpdate();timer=setTimeout(tick,stepMs);}
        tick();
    }
    return {start,finish};
}
