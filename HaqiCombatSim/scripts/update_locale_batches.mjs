// Incremental companion to split/validate/merge_locale_batches: never erase old work.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runScan} from './scan_locale.mjs';
import {auditLocale,defaultManifest} from './audit_locale.mjs';
import {parseLocaleFile, formatLocaleLine} from '../js/locale_core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const localeDir=path.join(root,'data/adventure/locale');
const placeholders=text=>(text.match(/\{[^{}]+\}/g)||[]).sort();
export function validateTranslationRows(input, output, languages){
    if(!Array.isArray(output)||output.length!==input.length)throw Error('Translation row count differs');
    return input.map((source,index)=>{
        const row=output[index];
        if(row?.key!==source.key)throw Error(`Translation key differs at ${index}`);
        for(const lang of languages){
            if(typeof row[lang]!=='string'||!row[lang].trim())throw Error(`Empty ${lang} translation at ${index}`);
            if(JSON.stringify(placeholders(row[lang]))!==JSON.stringify(placeholders(source.key)))throw Error(`Placeholder mismatch at ${index} (${lang})`);
            if(lang==='en'&&/[\u3400-\u9fff]/u.test(row[lang]))throw Error(`Chinese remains in English at ${index}`);
        }
        return row;
    });
}

export function appendTranslations(text,rows,language){
    const table=parseLocaleFile(text),added=[];let addedCount=0;
    let section=null;
    for(const row of rows){
        if(table[row.key])continue;
        if(Object.hasOwn(table,row.key))throw Error(`Existing empty key needs explicit review: ${row.key}`);
        const source=String(row.section||'locale incremental update').replace(/[\r\n|]/g,' ');
        if(source!==section){added.push(`# ${source}`);section=source;}
        added.push(formatLocaleLine(row.key,row[language].trimEnd()));table[row.key]=row[language];
        addedCount++;
    }
    return {text:added.length?`${text.replace(/\s*$/,'')}\n\n${added.join('\n')}\n`:text,added:addedCount};
}

function prepare(directory, language){
    if(fs.existsSync(path.join(directory,'manifest.json')))throw Error('Use a fresh batch directory; existing manifest is protected');
    const policy=JSON.parse(fs.readFileSync(defaultManifest,'utf8'));
    const languages=language==='en'?['en']:language==='others'?(policy.languages||['en','ja','ko']).filter(id=>id!=='en'):['ja','ko'];
    const en=parseLocaleFile(fs.readFileSync(path.join(localeDir,'en.txt'),'utf8'));
    const dictionaries=Object.fromEntries(languages.map(id=>[id,parseLocaleFile(fs.readFileSync(path.join(localeDir,`${id}.txt`),'utf8'))]));
    const scan=runScan({manifestPath:path.join(root,'.cursor/skills/locale-scan/scan-paths.json')});
    const audit=auditLocale({manifestPath:defaultManifest});
    if(audit.missingFiles.length)throw Error('Scan manifest contains missing files; repair it before preparing translations');
    if(audit.errors.length)throw Error('Repair empty/malformed dictionary entries before preparing translations; run locale:audit for details');
    if(language!=='en'&&audit.missingEnglish.length)throw Error('Complete and merge missing English first');
    const rows=language==='en'?audit.missingEnglish.map(row=>({key:row.text,section:row.file})):Object.entries(en).filter(([key,value])=>value&&languages.some(id=>!dictionaries[id][key])).map(([key,value])=>({key,en:value,section:scan.staticHits.get(key)?.file||'existing en dictionary'}));
    fs.mkdirSync(path.join(directory,'in'),{recursive:true});fs.mkdirSync(path.join(directory,'out'),{recursive:true});
    const batches=[];
    for(let i=0;i<rows.length;i+=40){
        const id=String(batches.length).padStart(3,'0'),entries=rows.slice(i,i+40);
        const batch={id,languages,entries};
        const input=`in/batch_${id}.json`,output=`out/batch_${id}.json`;
        if(fs.existsSync(path.join(directory,input)))throw Error('Use a new batch directory; existing inputs are protected');
        fs.writeFileSync(path.join(directory,input),JSON.stringify(batch,null,2)+'\n');batches.push({id,input,output});
    }
    fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({languages,totalKeys:rows.length,batches},null,2)+'\n');
    console.log(JSON.stringify({directory,languages,keys:rows.length,batches:batches.length}));
}

function merge(directory){
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
    const rows=manifest.batches.flatMap(batch=>{
        const input=JSON.parse(fs.readFileSync(path.join(directory,batch.input),'utf8'));
        const output=JSON.parse(fs.readFileSync(path.join(directory,batch.output),'utf8'));
        return validateTranslationRows(input.entries,output.entries,manifest.languages).map((row,index)=>({...row,section:input.entries[index].section}));
    });
    if(new Set(rows.map(row=>row.key)).size!==rows.length)throw Error('Duplicate input keys');
    // Validate every batch and every target before writing any dictionary.
    const updates=manifest.languages.map(language=>{
        const file=path.join(localeDir,`${language}.txt`),before=fs.readFileSync(file,'utf8');
        return {file,language,...appendTranslations(before,rows,language)};
    });
    for(const update of updates)fs.writeFileSync(update.file,update.text,'utf8');
    console.log(JSON.stringify(updates.map(({language,added})=>({language,added}))));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const [command,directory,language='en']=process.argv.slice(2);
    if(!directory||!['prepare','merge'].includes(command)||!['en','ja-ko','others'].includes(language))throw Error('Usage: node scripts/update_locale_batches.mjs prepare|merge <fresh-directory> [en|others|ja-ko]');
    if(command==='prepare')prepare(path.resolve(directory),language);else merge(path.resolve(directory));
}
