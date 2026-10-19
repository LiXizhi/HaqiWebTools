import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../js/prologue_app.js',import.meta.url),'utf8');
test('序章手动等待、开启自动播放、关闭后重新计时及手动继续',async()=>{
    let tick,time=0;
    const context=vm.createContext({
        epoch:0,autoPlay:false,readAloud:false,doc:{hidden:false},
        tapResolvers:new Set(),skipResolvers:new Set(),guard(){},
        performance:{now:()=>time},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},
    });
    vm.runInContext(source.slice(source.indexOf('    function advance('),source.indexOf('    const wait=')),context);
    let completed=false;
    const pending=context.advance(2).then(()=>{completed=true;});
    time=10000;tick();await Promise.resolve();assert.equal(completed,false);
    context.autoPlay=true;time+=1000;tick();await Promise.resolve();assert.equal(completed,false);
    context.autoPlay=false;time+=10000;tick();await Promise.resolve();assert.equal(completed,false);
    context.autoPlay=true;time+=1000;tick();await Promise.resolve();assert.equal(completed,false);
    time+=1000;tick();await pending;assert.equal(completed,true);
    assert.equal(context.tapResolvers.size,0);
    context.autoPlay=false;
    const manual=context.advance(2);
    for(const finish of context.tapResolvers)finish();
    await manual;
    assert.equal(context.tapResolvers.size,0);
    assert.equal(context.skipResolvers.size,0);
});


test('自动播放连续推进镜头，后台与朗读期间暂停计时',async()=>{
    let tick,time=0;
    const context=vm.createContext({
        epoch:0,autoPlay:true,readAloud:true,narration:{pending:false},doc:{hidden:false},
        tapResolvers:new Set(),skipResolvers:new Set(),guard(){},
        performance:{now:()=>time},setInterval:fn=>{tick=fn;return 1;},clearInterval(){},
    });
    vm.runInContext(source.slice(source.indexOf('    function advance('),source.indexOf('    const wait=')),context);
    for(let beat=0;beat<3;beat++){
        let completed=false;
        const pending=context.advance(2).then(()=>{completed=true;});
        context.doc.hidden=true;time+=10000;tick();await Promise.resolve();assert.equal(completed,false);
        context.doc.hidden=false;context.narration.pending=true;
        time+=10000;tick();await Promise.resolve();assert.equal(completed,false);
        context.narration.pending=false;time+=2000;tick();await pending;
        assert.equal(completed,true);assert.equal(context.tapResolvers.size,0);
    }
});
