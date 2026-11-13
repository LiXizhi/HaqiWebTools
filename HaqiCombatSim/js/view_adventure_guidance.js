import {setText} from './locale_runtime.js';

// Shared presentation only. Callers supply facts and actions from their own model.
export function guidanceCard({eyebrow='',title='',body='',steps=[],footnote='',className=''}={}){
    const card=document.createElement('section');card.className=['adventure-guidance',className].filter(Boolean).join(' ');
    function add(tag,kind,text){if(!text)return;const node=document.createElement(tag);node.className=kind;setText(node,text);card.append(node);return node;}
    add('small','adventure-guidance-eyebrow',eyebrow);
    add('strong','adventure-guidance-title',title);
    add('p','adventure-guidance-body',body);
    if(steps.length){const list=document.createElement('ol');list.className='adventure-guidance-steps';for(const text of steps){const row=document.createElement('li');setText(row,text);list.append(row);}card.append(list);}
    add('small','adventure-guidance-footnote',footnote);
    return card;
}

export function equipmentComparison(rows,{title='穿上后，与你现在的装备相比',empty='主要属性不变，可以按附加卡牌和用途选择。',limit=6}={}){
    const card=guidanceCard({eyebrow:'装备比较',title});
    const list=document.createElement('dl');list.className='equipment-change-list';
    for(const row of rows.slice(0,limit)){
        const name=document.createElement('dt'),value=document.createElement('dd');setText(name,row.label);
        value.className=row.delta>0?'stat-gain':'stat-loss';setText(value,'{sign}{delta}{unit}',{sign:row.delta>0?'+':'',delta:row.delta,unit:row.unit||''});list.append(name,value);
    }
    if(rows.length)card.append(list);else {const p=document.createElement('p');setText(p,empty);card.append(p);}
    if(rows.length>limit){const p=document.createElement('small');setText(p,'另有 {count} 项变化，可在装备面板查看。',{count:rows.length-limit});card.append(p);}
    return card;
}
