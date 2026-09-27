// Constraint-preserving incremental construction; never enumerates deck combinations.
export function optimizeDeck({cards,limits,locked=[],current=[],handSize=8,role='balanced',requirements=[]}, {scoreCard,semantics}={}) {
    if(!scoreCard||!semantics)throw Error('缺少卡牌收益与语义适配器');
    const capacity=limits.capacity||cards.reduce((sum,c)=>sum+c.maxCopies,0),deck=[],counts=new Map();
    const available=new Map(cards.map(c=>[c.key,c]));
    for(const row of locked){const card=available.get(row.key);if(counts.has(row.key)||!card||!Number.isInteger(row.count)||row.count<1||row.count>card.maxCopies||(limits.eachCapacity>0&&row.count>limits.eachCapacity))throw Error('锁定卡牌不满足资格或份数限制');counts.set(row.key,row.count);deck.push({...row});}
    let total=deck.reduce((sum,r)=>sum+r.count,0);if(total>capacity)throw Error('锁定卡牌超过容量');
    const selectedRoles=()=>{const out={};for(const row of deck)for(const tag of semantics(available.get(row.key)).roles)out[tag]=(out[tag]||0)+row.count;return out;};
    const add=card=>{const row=deck.find(r=>r.key===card.key);if(row)row.count++;else deck.push({key:card.key,count:1});counts.set(card.key,(counts.get(card.key)||0)+1);total++;};
    const canAdd=card=>!locked.some(r=>r.key===card.key)&&(counts.get(card.key)||0)<card.maxCopies&&(!(limits.eachCapacity>0)||(counts.get(card.key)||0)<limits.eachCapacity);
    // Reserve a playable tactical skeleton before damage efficiency fills the bag.
    // Requirements are ordered by the adapter; locked copies still count toward them.
    const covered=req=>deck.reduce((sum,row)=>sum+(req.keys.includes(row.key)?row.count:0),0);
    for(const req of requirements){
        if(!Number.isInteger(req.min)||req.min<0||!Array.isArray(req.keys))throw Error('配包职责要求无效');
        while(total<capacity&&covered(req)<req.min){
            const choices=cards.filter(c=>req.keys.includes(c.key)&&canAdd(c));
            choices.sort((a,b)=>scoreCard(b,{role,deck,roles:selectedRoles()})/(1+(counts.get(b.key)||0))-scoreCard(a,{role,deck,roles:selectedRoles()})/(1+(counts.get(a.key)||0))||a.key.localeCompare(b.key));
            if(!choices.length)break;add(choices[0]);
        }
    }
    while(total<capacity){
        const roles=selectedRoles();let best=null;
        for(const card of cards){const count=counts.get(card.key)||0;if(locked.some(r=>r.key===card.key)||count>=card.maxCopies||(limits.eachCapacity>0&&count>=limits.eachCapacity))continue;
            const tags=semantics(card).roles,base=scoreCard(card,{role,deck,roles}),needed=tags.some(tag=>!roles[tag]);
            const marginal=base/(1+count)+(needed?Math.abs(base)*0.5:0)-Math.max(0,total-handSize)*Math.abs(base)*0.03;
            if(marginal>0&&(!best||marginal>best.score))best={card,score:marginal,needed};
        }
        if(!best)break;
        const key=best.card.key,row=deck.find(r=>r.key===key);if(row)row.count++;else deck.push({key,count:1});counts.set(key,(counts.get(key)||0)+1);total++;
    }
    const diff=[...new Set([...current.map(c=>c.key),...deck.map(c=>c.key)])].map(key=>({key,from:current.find(c=>c.key===key)?.count||0,to:counts.get(key)||0})).filter(d=>d.from!==d.to);
    const chanceAtLeastOne=count=>{let miss=1;for(let i=0;i<Math.min(handSize,total);i++)miss*=Math.max(0,total-count-i)/(total-i);return 1-miss;};
    return {version:1,deck,diff,total,roles:selectedRoles(),requirements:requirements.map(req=>({id:req.id,required:req.min,actual:covered(req),satisfied:covered(req)>=req.min})),openingAccess:deck.map(row=>({key:row.key,probability:chanceAtLeastOne(row.count)})),
        reasons:['按卡牌职责补足缺口，并兼顾起手抽到关键牌的概率','此方案为有限预算推荐，需要结合实际对手验证'],automatic:false};
}
