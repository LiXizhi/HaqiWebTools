import test from 'node:test';import assert from 'node:assert/strict';
import {rules} from '../fixtures/data.mjs';import {defaultScenario} from '../../js/data/presets.js';
import {runBatch,createReport,matchAt,validateExperiment} from '../../js/simulation/runner.js';
for(const population of ['fixed','matrix','mixed','replacement'])test(`${population}: sharding, swap balance and statistics`,()=>{
 const r=rules.kids,e={schemaVersion:1,count:12,seed:43,population,strategy:'tactical',replacementSchool:'life',scenario:defaultScenario(r,2)};
 const whole=runBatch(e,r),chunks=[...runBatch(e,r,{start:6,count:6}),...runBatch(e,r,{start:0,count:6})];
 assert.deepEqual(createReport(e,r,whole),createReport(e,r,chunks));const report=createReport(e,r,whole);
 assert.equal(report.completed,12);assert.equal(report.partial,false);assert.equal(report.summary.wins+report.summary.draws+report.summary.losses, population==='replacement'?6:12);
 assert.deepEqual(matchAt(e,r,0).scenario.teams,matchAt(e,r,1).scenario.teams.reverse());
 if(population==='replacement')assert.equal(report.replacement.pairs,3);
 assert.equal(createReport(e,r,whole.slice(0,5)).partial,true);
});
test('invalid experiment is rejected before work',()=>{assert.throws(()=>validateExperiment({count:3,population:'fixed'}));});
