import {walkable} from './adventure_world_core.js';

const DEFINITIONS=[
    {id:'mushroom',name:'会唱歌的蘑菇',x:1780,y:1630,size:76,line:'它会唱歌！再碰一下，声音就变了。',sound:'heal'},
    {id:'crystal',name:'藏光晶簇',x:1540,y:1640,size:84,line:'里面有光，再敲两下试试。',sound:'shield'},
    {id:'bells',name:'铃兰风铃',x:1390,y:1580,size:90,line:'听，风把铃声送过去了。',sound:'heal'},
    {id:'fireflies',name:'萤火树洞',x:1260,y:1520,size:78,line:'小家伙们飞出来啦！',sound:'friendship'},
    {id:'spring',name:'回声泉',x:1370,y:1390,size:80,line:'水花在回答你。我们继续冒险吧！',sound:'splash'},
];

// Optional scene toys. No inventory, XP, quest, collision or save mutations.
export function createCampToys(art){
    let scope=null,rows=[],lastNow=0;
    function prepare(world){
        if(scope===world)return;scope=world;rows=[];
        if(world.zone!=='camp'||!art)return;
        for(const definition of DEFINITIONS){
            let point=null;
            const offsets=[[0,0]];for(const radius of [32,64,96,128])for(let i=0;i<8;i++)offsets.push([Math.cos(i*Math.PI/4)*radius,Math.sin(i*Math.PI/4)*radius]);
            for(const [dx,dy] of offsets){
                const p={x:definition.x+dx,y:definition.y+dy};
                if(walkable(world,p.x,p.y)&&!world.npcs.some(n=>Math.hypot(n.x-p.x,n.y-p.y)<65)&&!world.encounters.some(n=>Math.hypot(n.x-p.x,n.y-p.y)<180)&&!rows.some(n=>Math.hypot(n.x-p.x,n.y-p.y)<75)){point=p;break;}
            }
            if(point)rows.push({...definition,...point,kind:'camp-toy',hits:0,activated:-Infinity,restUntil:0});
        }
        world.campToyTargets=rows;
        void art.warm(['toys']);
    }
    function pick(point){if(!art?.images?.toys)return null;return rows.filter(row=>lastNow>=row.restUntil&&Math.abs(row.x-point.x)<40&&point.y>row.y-row.size&&point.y<row.y+14).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]||null;}
    function nearest(point,radius=85){if(!art?.images?.toys)return null;return rows.filter(row=>lastNow>=row.restUntil&&Math.hypot(row.x-point.x,row.y-point.y)<radius).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y))[0]||null;}
    function syncCrystalProgress(progress){
        const row=rows.find(r=>r.id==='crystal');
        if(!row||!Number.isInteger(progress)||progress<0||progress>2)return;
        // Persisted quest progress owns the visual count; matching frames preserve bounce age.
        if(row.hits!==progress||row.restUntil!==0){row.hits=progress;row.restUntil=0;}
    }
    function planInteraction(target,now){
        const row=rows.find(r=>r.id===target.id);if(!row||now<row.restUntil||now-row.activated<(row.id==='bells'?400:180))return null;
        const previous={hits:row.hits,activated:row.activated,restUntil:row.restUntil};
        const hits=row.hits+1;let restUntil=row.restUntil;
        let line=row.line,count=7,rate=1;
        if(row.id==='mushroom')rate=[.82,1,1.22][(hits-1)%3];
        if(row.id==='crystal'){
            const remaining=3-hits%3;
            line=remaining===2?'里面有光，再敲两下试试。':remaining===1?'快打开了，再一下！':'星光跑出来了！';
            if(hits%3===0){restUntil=now+6000;count=22;}
        }
        if(row.id==='fireflies')count=14;
        const sound=row.id==='crystal'?(hits%3===0?'shield':'click'):row.id==='fireflies'?'select':row.sound;
        const gain=row.id==='bells'?.45:row.id==='fireflies'?.5:1;
        const response={point:{x:row.x,y:row.y-25},line,sound,count,rate,gain};
        let committed=false;
        return {response,commit(){
            if(committed||!rows.includes(row)||row.hits!==previous.hits||row.activated!==previous.activated||row.restUntil!==previous.restUntil)return false;
            committed=true;row.activated=now;row.hits=hits;row.restUntil=restUntil;return true;
        }};
    }
    function interact(target,now){const plan=planInteraction(target,now);return plan?.commit()?plan.response:null;}
    function draw(ctx,row,now,{reduced=false,near=false}={}){
        lastNow=now;if(!art?.images?.toys)return;const age=now-row.activated,q=Math.min(1,Math.max(0,age/600));
        let scale=1,rotation=0,alpha=1;
        if(!reduced&&age<600){scale+=Math.sin(q*Math.PI)*.12;rotation=row.id==='bells'?Math.sin(q*Math.PI*4)*.09:0;}
        if(row.restUntil>now){alpha=age<400?1-age/400:.12;scale*=age<400?1-q*.5:.8;}
        ctx.save();ctx.translate(row.x,row.y);ctx.rotate(rotation);ctx.scale(scale,scale);ctx.globalAlpha*=alpha;
        if(near||age<600){ctx.shadowColor='#ffeeb4';ctx.shadowBlur=near?9:16;}
        art?.draw(ctx,'toys',row.id,-row.size/2,-row.size,row.size,row.size);ctx.restore();
    }
    return{prepare,pick,nearest,interact,planInteraction,syncCrystalProgress,draw,get rows(){return rows;},active:now=>rows.some(row=>now-row.activated<650),clear(){scope=null;rows=[];}};
}
