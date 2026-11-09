import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function checkRuneSource({sourcePath,catalogPath}){
    if(!fs.existsSync(sourcePath))throw Error(`缺少原版符文来源文件：${sourcePath}。请用 --source 指定完整客户端源码中的 RuneList.xml；此项核对未完成。`);
    const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
    const expected=catalog.sources?.['config/Aries/Cards/RuneList.xml'];
    if(!/^[a-f0-9]{64}$/.test(expected||''))throw Error('符文目录缺少有效的原版来源哈希');
    const actual=createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
    if(actual!==expected)throw Error(`原版符文来源哈希不一致：期望 ${expected}，实际 ${actual}。请核对导出版本，不能作为校验通过。`);
    return {sourcePath,sha256:actual};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
    try{
        const args=process.argv.slice(2);
        if(args.length&&!(args.length===2&&args[0]==='--source'))throw Error('用法：node scripts/check_rune_source.mjs [--source <RuneList.xml路径>]');
        const sourcePath=args.length?path.resolve(args[1]):fileURLToPath(new URL('../../../config/Aries/Cards/RuneList.xml',import.meta.url));
        const result=checkRuneSource({sourcePath,catalogPath:fileURLToPath(new URL('../data/adventure/runes.json',import.meta.url))});
        console.log(`原版符文来源校验通过：${result.sha256}`);
    }catch(error){console.error(error.message);process.exitCode=1;}
}
