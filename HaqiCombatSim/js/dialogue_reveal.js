// One reveal sequence: original text first, then its native-language translation.
export function createDialogueReveal({reduced=()=>globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??true,stepMs=22}={}){
    let timer=null,rows=[];
    function finish(){clearTimeout(timer);timer=null;for(const row of rows){if(row.animate)row.node.textContent=row.text;if(row.translation)row.translation.hidden=false;}rows=[];}
    function start(nodes){finish();rows=nodes.filter(Boolean).map(value=>value.node?value:{node:value}).map(({node,translation})=>({node,translation,text:node.textContent,chars:Array.from(node.textContent||''),animate:!node.childElementCount}));
        if(reduced()){finish();return;}
        for(const row of rows){if(row.animate)row.node.textContent='';if(row.translation)row.translation.hidden=true;}let index=0,count=0;
        function tick(){const row=rows[index];if(!row){timer=null;rows=[];return;}count=row.animate?Math.min(row.chars.length,count+Math.max(1,Math.ceil(row.chars.length/65))):row.chars.length;if(row.animate)row.node.textContent=row.chars.slice(0,count).join('');if(count===row.chars.length){if(row.translation)row.translation.hidden=false;index++;count=0;}timer=setTimeout(tick,stepMs);}
        tick();
    }
    return {start,finish};
}
