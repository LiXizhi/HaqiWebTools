import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validate,metricText,renderReport,chinaDate} from '../scripts/marketing_ops.mjs';
const channels = JSON.parse(await readFile(new URL('../docs/marketing/channels.json',import.meta.url)));
const queue = JSON.parse(await readFile(new URL('../docs/marketing/queue.json',import.meta.url)));
const now = new Date('2026-09-27T16:30:00Z');
test('未知数据不显示为零，按北京时间归档',()=>{
  assert.equal(chinaDate(now),'2026-09-28');
  assert.equal(metricText(undefined,now),'未接入');
  assert.match(renderReport(channels,queue,{},now),/真实新订单：未接入/);
});
test('未审核及无证据不得标记已发布或自动运营',()=>{
  validate(channels,queue);
  const bad=structuredClone(queue);bad.items[0].status='published';
  assert.throws(()=>validate(channels,bad),/审核记录/);
  const badChannels=structuredClone(channels);Object.assign(badChannels.channels[0],{status:'automated',accountUrl:'https://example.com',verifiedAt:'2026-09-27',publishEvidence:'https://example.com/post'});
  assert.throws(()=>validate(badChannels,queue),/完整验收证据/);
});
test('缺失、未来和陈旧指标不能伪装成当前已验证数据',()=>{
  assert.match(metricText({status:'verified',value:0},now),/待核验/);
  const item={status:'verified',value:0,evidence:'test source',asOf:'2026-09-27T10:00:00Z'};
  assert.match(metricText(item,now),/^0/);
  assert.match(metricText({...item,asOf:'2026-09-28T20:00:00Z'},now),/晚于报告/);
  assert.match(metricText({...item,asOf:'2026-09-20T10:00:00Z'},now),/已过期/);
});
test('重复反馈和没有出处的反馈被拒绝',()=>{
  const f={id:'a',summary:'示例',url:'https://example.com/1',occurredAt:'2026-09-27T10:00:00Z'};
  assert.throws(()=>renderReport(channels,queue,{feedback:[f,f]},now),/反馈需/);
  assert.throws(()=>renderReport(channels,queue,{feedback:[{...f,url:''}]},now),/反馈需/);
});
