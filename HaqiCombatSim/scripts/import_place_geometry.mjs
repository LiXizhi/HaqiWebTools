import fs from 'node:fs';
import {importPlaceGeometry} from '../js/adventure_place_import_core.js';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
if(!args.length||args.includes('--help')){console.log('node scripts/import_place_geometry.mjs input.json --lon N --lat N [--meters 300] [--style old] [--output fragment.json]');process.exit(0);}
const origin={lon:Number(option('--lon')),lat:Number(option('--lat')),meters:args.includes('--meters')?Number(option('--meters')):300,unitsPerMeter:16};
const input=JSON.parse(fs.readFileSync(args[0],'utf8')),result=importPlaceGeometry(input,origin,{style:args.includes('--style')?option('--style'):'modern'});
if(!result.report.roads)throw Error('没有道路几何，不能生成已还原场景');
result.streetscape.provenance.sourceFile=args[0];result.streetscape.provenance.retrievedAt=input.authoringSource?.retrievedAt;
if(args.includes('--output'))fs.writeFileSync(option('--output'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({size:result.size,...result.report},null,2));
