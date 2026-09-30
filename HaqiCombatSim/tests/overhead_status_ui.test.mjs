import test from 'node:test';
import assert from 'node:assert/strict';
import {battleStatusEffects,overheadStatusEffects,drawOverheadStatus} from '../js/view_adventure_overhead_status.js';
import {popDoT,popHoT} from '../js/combat_unit_core.js';

test('consumed effects disappear while anonymous absorption and active auras remain visible',()=>{
    const unit={hp:10,charms:[0,1],wards:[{id:0},{id:0,absorb:true,pts:70},{id:2,absorb:true,pts:0}],standingWards:[{id:3,rounds:0}],miniaura:{id:4,rounds:2}};
    const battle={resolved:{charms:{1:{desc:'攻击降低',positive:false}},miniauras:{4:{desc:'专注'}}}};
    const effects=battleStatusEffects(unit,battle);
    assert.deepEqual(effects.map(e=>e.desc),['攻击降低','吸收盾 70','专注 · 2回合']);
    assert.equal(effects[0].negative,true);
    unit.charms[1]=0;unit.wards[1].pts=0;unit.miniaura.rounds=0;
    assert.deepEqual(battleStatusEffects(unit,battle),[]);
});

test('overhead icons repeat layers without any text and hide defeated units',()=>{
    const texts=[],positions=[];
    const context=new Proxy({fillText(t){texts.push(t);},strokeText(t){texts.push(t);},translate(x,y){positions.push({x,y});}}, {get:(o,k)=>k in o?o[k]:()=>{}});
    const unit={hp:10,charms:[1,1,2]},battle={resolved:{charms:{1:{desc:'增益'},2:{desc:'减益',positive:false}}}};
    drawOverheadStatus(context,unit,battle,{x:5,y:60},390);
    assert.deepEqual(texts,[]);
    const icons=positions.filter(p=>p.y===4);
    assert.equal(icons.length,3);
    assert.ok(icons.every(p=>p.x>=0&&p.x+28<=390));
    positions.length=0;drawOverheadStatus(context,unit,battle,{x:5,y:60},390,0);
    assert.deepEqual(texts,[]);
    assert.deepEqual(positions,[]);
});

test('only periodic durations add numeric badges to the overhead icons',()=>{
    let drawings=0;const texts=[];
    const context=new Proxy({createLinearGradient(){return {addColorStop(){}};},fillText(value){texts.push(value);},strokeText(){assert.fail('no text labels');},fill(){drawings++;}}, {get:(o,k)=>k in o?o[k]:()=>{}});
    const unit={hp:10,wards:[{id:1},{id:2},{id:0,absorb:true,pts:10}],dots:[{ticks:[{dmg:10},{dmg:10},{dmg:10}]},{ticks:[{dmg:5}]}],hots:[{ticks:[20,20]}],stunned:true,stealth:true,reflectAmount:10,miniaura:{id:1,rounds:2}};
    drawOverheadStatus(context,unit,{resolved:{wards:{1:{school:'ice'},2:{school:'fire',positive:false}}}},{x:380,y:140},390);
    assert.ok(drawings>=10);
    assert.deepEqual(texts,['3','1','2']);
    popDoT(unit);popHoT(unit);
    assert.deepEqual(battleStatusEffects(unit,{resolved:{}}).filter(e=>e.rounds).map(e=>[e.kind,e.rounds]),[['dots',2],['hots',1]]);
    popDoT(unit);popHoT(unit);popDoT(unit);
    assert.equal(battleStatusEffects(unit,{resolved:{}}).filter(e=>e.rounds).length,0);
});

test('identical wards share one counted icon while different wards and periodic durations stay separate',()=>{
    const unit={hp:10,wards:[{id:1},{id:1},{id:1},{id:1},{id:2}],dots:[{ticks:[{},{}]},{ticks:[{}]}]};
    // Even identical descriptions must not merge distinct shield definitions.
    const battle={resolved:{wards:{1:{school:'all',desc:'护盾'},2:{school:'all',desc:'护盾'}}}};
    const effects=overheadStatusEffects(unit,battle);
    assert.equal(effects.length,4);
    assert.deepEqual(effects.map(e=>e.count),[4,1,1,1]);
    assert.deepEqual(effects.slice(2).map(e=>e.rounds),[2,1]);
    assert.equal(battleStatusEffects(unit,battle).length,7);
    const texts=[],context=new Proxy({fillText(value){texts.push(value);}}, {get:(o,k)=>k in o?o[k]:()=>{}});
    drawOverheadStatus(context,unit,battle,{x:100,y:180},390);
    assert.deepEqual(texts,['4','2','1']);
    unit.wards[0].id=0;
    assert.equal(overheadStatusEffects(unit,battle)[0].count,3);
    unit.wards=[{id:1}];texts.length=0;
    drawOverheadStatus(context,unit,battle,{x:100,y:180},390);
    assert.deepEqual(texts,['2','1']);
});

test('trap and blade boost text prefer school phrasing over cryptic Lua snapshots',()=>{
    const unit={hp:10,charms:[2015],wards:[{id:3024},{id:36}]};
    const battle={resolved:{
        charms:{2015:{boost_damage:55,school:'storm',positive:true,desc:'+55%风暴攻击'}},
        wards:{
            3024:{boost_damage:55,school:'storm',positive:false,desc:'+55%风暴伤害'},
            36:{boost_damage:55,school:'life',positive:false,desc:'+55%生命伤害'},
        },
    }};
    assert.deepEqual(battleStatusEffects(unit,battle).map(e=>e.desc),[
        '下次风暴攻击加 55%',
        '受到的风暴攻击加 55%',
        '受到的生命攻击加 55%',
    ]);
});

test('negative wards draw a spiky trap outline instead of an inverted triangle',()=>{
    const moves=[];
    const context=new Proxy({
        beginPath(){moves.push('begin');},
        moveTo(x,y){moves.push(['m',Math.round(x),Math.round(y)]);},
        lineTo(x,y){moves.push(['l',Math.round(x),Math.round(y)]);},
        closePath(){moves.push('close');},
        fill(){moves.push('fill');},
        stroke(){moves.push('stroke');},
        arc(){moves.push('arc');},
        ellipse(){},
        quadraticCurveTo(){},
        bezierCurveTo(){},
        createLinearGradient(){return {addColorStop(){}};},
        save(){},restore(){},translate(){},scale(){},
        roundRect(){},
        fillText(){},
        strokeText(){},
    }, {get:(o,k)=>k in o?o[k]:()=>{}});
    drawOverheadStatus(context,{hp:10,wards:[{id:1}]},{resolved:{wards:{1:{school:'storm',positive:false,boost_damage:55}}}},{x:100,y:120},390);
    assert.ok(moves.includes('close'));
    assert.ok(moves.filter(m=>Array.isArray(m)&&m[0]==='l').length>=16);
    assert.equal(moves.some(m=>Array.isArray(m)&&m[0]==='m'&&m[1]===1&&m[2]===4),false);
});

test('mounted status rows clear the rider bounds and keep tooltip hitboxes aligned',()=>{
    const c=new Proxy({}, {get:()=>()=>{}}),unit={id:'hero',hp:10,charms:[1,1,1,1,1]},battle={resolved:{charms:{1:{desc:'增益'}}}};
    const normal=drawOverheadStatus(c,unit,battle,{x:200,y:350},800);
    const mounted=drawOverheadStatus(c,unit,battle,{x:200,y:350,statusBottom:185},800);
    assert.equal(mounted.length,5);
    for(let i=0;i<mounted.length;i++){
        assert.equal(mounted[i].x,normal[i].x);
        assert.ok(mounted[i].y<normal[i].y);
        assert.ok(mounted[i].y+mounted[i].height<185);
    }
    const edge=drawOverheadStatus(c,unit,battle,{x:5,y:80,statusBottom:-20},390);
    assert.ok(edge.every(r=>r.y>=4&&r.x>=4));
});
