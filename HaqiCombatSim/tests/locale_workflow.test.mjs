import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditLocale} from '../scripts/audit_locale.mjs';

test('global audit discovers new views, scopes exceptions, and keeps stale/dynamic review separate',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haqi-locale-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    fs.mkdirSync(path.join(dir,'js'));fs.mkdirSync(path.join(dir,'locale'));
    fs.writeFileSync(path.join(dir,'js/view_known.js'),"const a='内部词';const b=`动态 ${n}`;");
    fs.writeFileSync(path.join(dir,'js/view_lab.js'),"const a='实验室';");
    const policy={localeDir:'locale',languages:['en','ja','ko'],dirs:[{path:'js',include:['view_*.js'],exclude:['view_lab.js']}],
        ignore:[{file:'js/view_known.js',text:'内部词',reason:'internal'}]};
    const manifestPath=path.join(dir,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(policy));
    for(const language of policy.languages)fs.writeFileSync(path.join(dir,`locale/${language}.txt`),'旧句||Old\n');
    let report=auditLocale({manifestPath,baseDir:dir});
    assert.equal(report.ok,true);assert.equal(report.dynamicReview.length,1);assert.equal(report.staleReview.length,1);
    fs.writeFileSync(path.join(dir,'js/view_new.js'),"const a='内部词';const b='新场景';");
    report=auditLocale({manifestPath,baseDir:dir});
    assert.equal(report.ok,false);assert.deepEqual(report.missingEnglish.map(row=>row.text),['内部词','新场景']);
    assert.ok(report.missingEnglish.every(row=>row.file==='js/view_new.js'));
    fs.appendFileSync(path.join(dir,'locale/en.txt'),'新场景||Scene\n内部词||Internal\n数量 {n}||Count {n}\n');
    fs.appendFileSync(path.join(dir,'locale/ja.txt'),'数量 {n}||Count\n');
    report=auditLocale({manifestPath,baseDir:dir});
    assert.equal(report.missingEnglish.length,0);assert.ok(report.alignment.some(row=>row.missing.includes('新场景')));
    assert.ok(report.errors.some(row=>row.error==='placeholder mismatch'));
});

test('batch runner streams validated output and resumes without another provider request',async t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'haqi-translate-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    fs.mkdirSync(path.join(dir,'in'));fs.mkdirSync(path.join(dir,'out'));
    fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({languages:['en'],batches:[{id:'000',input:'in/000.json',output:'out/000.json'}]}));
    fs.writeFileSync(path.join(dir,'in/000.json'),JSON.stringify({entries:[{key:'收集 {n} 个'}]}));
    let calls=0;
    const server=http.createServer((req,res)=>{calls++;req.resume();res.writeHead(200,{'Content-Type':'text/event-stream'});
        const text=JSON.stringify({entries:[{key:'收集 {n} 个',en:'Collect {n} items'}]});
        for(const part of [text.slice(0,10),text.slice(10)])res.write('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n');
        res.end('data: [DONE]\n\n');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
    const run=()=>new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/translate_locale_batches.mjs',import.meta.url)),dir],{
            env:{...process.env,HAQI_TRANSLATION_ENDPOINT:`http://127.0.0.1:${server.address().port}/v1/chat/completions`,
                HAQI_TRANSLATION_API_KEY:'test-only',HAQI_TRANSLATION_MODEL:'test',HAQI_TRANSLATION_WORKERS:'1'},stdio:'ignore'});
        child.on('error',reject);child.on('exit',resolve);
    });
    assert.equal(await run(),0);assert.equal(await run(),0);assert.equal(calls,1);
    const output=JSON.parse(fs.readFileSync(path.join(dir,'out/000.json')));
    assert.equal(output.entries[0].en,'Collect {n} items');
    fs.writeFileSync(path.join(dir,'out/000.json'),JSON.stringify({entries:[{key:'收集 {n} 个',en:'Collect items'}]}));
    assert.notEqual(await run(),0);assert.equal(calls,1);
});
