// Read-only global audit. Translation preparation uses the same policy and report.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runScan} from './scan_locale.mjs';
import {parseLocaleFile} from '../js/locale_core.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const defaultManifest=path.join(root,'.cursor/skills/locale-scan/scan-paths.json');
export function ignoreReason(row,policy){
    return policy.ignore?.find(rule=>rule.file===row.file &&
        (rule.text===row.text || rule.pattern&&new RegExp(rule.pattern,'u').test(row.text)))?.reason;
}
const tokens=text=>(text.match(/\{[^{}]+\}/g)||[]).sort().join('\0');
export function auditLocale({manifestPath=defaultManifest,baseDir=root}={}){
    const policy=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const scan=runScan({manifestPath,baseDir});
    const localeDir=path.resolve(baseDir,policy.localeDir);
    const languages=policy.languages||['en','ja','ko'];
    const allowedEmpty=new Set((policy.allowedEmpty||[]).map(row=>row.key));
    const tables={},errors=[];
    for(const language of languages){
        const file=path.join(localeDir,`${language}.txt`);
        if(!fs.existsSync(file)){errors.push({language,error:'missing dictionary'});tables[language]={};continue;}
        tables[language]=parseLocaleFile(fs.readFileSync(file,'utf8'));
        for(const [key,value]of Object.entries(tables[language])){
            if(!value){if(!allowedEmpty.has(key))errors.push({language,key,error:'empty translation'});continue;}
            if(tokens(key)!==tokens(value))errors.push({language,key,error:'placeholder mismatch'});
            if(language==='en'&&/[\u3400-\u9fff]/u.test(value))errors.push({language,key,error:'Chinese remains in English'});
        }
    }
    const missingOccurrences=scan.staticOccurrences.filter(row=>!Object.hasOwn(tables.en,row.text));
    const ignored=missingOccurrences.filter(row=>ignoreReason(row,policy)).map(row=>({...row,reason:ignoreReason(row,policy)}));
    const missingEnglish=[...new Map(missingOccurrences.filter(row=>!ignoreReason(row,policy)).map(row=>[row.text,row])).values()];
    const alignment=languages.filter(id=>id!=='en').map(language=>({language,
        missing:Object.keys(tables.en).filter(key=>!Object.hasOwn(tables[language],key)),
        extra:Object.keys(tables[language]).filter(key=>!Object.hasOwn(tables.en,key))}));
    const ok=!missingEnglish.length&&!scan.missingFiles.length&&!errors.length&&alignment.every(row=>!row.missing.length&&!row.extra.length);
    return {ok,files:scan.files.length,counts:Object.fromEntries(languages.map(id=>[id,Object.keys(tables[id]).length])),
        missingEnglish,ignored,missingFiles:scan.missingFiles.map(row=>row.rel),alignment,errors,
        dynamicReview:scan.dynamicHits,staleReview:scan.stale};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const args=process.argv.slice(2),flag=args.indexOf('--report'),paths=args.indexOf('--paths');
    const report=auditLocale(paths>=0?{manifestPath:path.resolve(args[paths+1])}:{});
    if(flag>=0){const file=path.resolve(args[flag+1]);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify({ok:report.ok,files:report.files,counts:report.counts,missingEnglish:report.missingEnglish.length,
        alignment:report.alignment.map(({language,missing,extra})=>({language,missing:missing.length,extra:extra.length})),
        errors:report.errors.length,missingFiles:report.missingFiles,dynamicReview:report.dynamicReview.length,staleReview:report.staleReview.length},null,2));
    // Stale and interpolated strings need human review; never erase historical keys automatically.
    if(args.includes('--check')&&!report.ok)process.exitCode=1;
}
