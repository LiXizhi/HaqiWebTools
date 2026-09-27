import { fill, setText } from './locale_runtime.js';

// A cosmetic failure must never remove the playable card or abort the hand.
export function createCardFace({el,draw,name,cost,cooldown,description,retry}) {
    const canvas=el('canvas','spell-art');canvas.width=302;canvas.height=460;
    const label=fill('{name}，消耗 {cost} 点魔力，冷却 {rounds} 回合。{description}',{name,cost,rounds:cooldown,description}).text;
    const pipHint=fill('{description}。本系法术：1个超级魔力抵2点；其他系抵1点。',{description}).text;
    function paint(){
        const context=canvas.getContext('2d');
        if(!context||draw(context)===false)throw new Error('卡面美术暂不可用');
    }
    try {
        paint();
        canvas.setAttribute('role','img');canvas.setAttribute('aria-label',label);
        canvas.title=pipHint;
        if(retry)retry().then(()=>{if(canvas.isConnected)try{paint();}catch{/* keep first paint */}}).catch(()=>{});
        return el('span','spell-face',canvas);
    } catch(error) {
        console.warn('使用文字卡牌：',name,error.message);
        const costLine=el('span','');
        setText(costLine,'{cost} 点魔力 · 冷却 {rounds} 回合',{cost,rounds:cooldown});
        const face=el('span','spell-face spell-face-fallback',
            el('strong','',name),costLine,
            el('span','',description),el('small','','图片暂不可用，仍可施法'));
        face.setAttribute('role','img');face.setAttribute('aria-label',label);
        if(retry)retry().then(()=>{
            if(!face.isConnected)return;
            try{
                paint();
                canvas.setAttribute('role','img');canvas.setAttribute('aria-label',label);canvas.title=pipHint;
                face.replaceChildren(canvas);face.className='spell-face';
            }catch{/* keep readable fallback */}
        }).catch(()=>{});
        return face;
    }
}
