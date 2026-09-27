import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const labels = {newUsers:'新增实际体验用户',totalUsers:'累计实际体验用户（目标 500／1000）',aiActivated:'AI 激活用户',d1:'D1 留存',d7:'D7 留存',d14:'D14 留存',paidOrders:'真实新订单',refunds:'退款',netRevenue:'净回款',aiCost:'AI 成本／额度消耗'};
const statusLabels = {not_connected:'未接入',verified:'账号已核验',review:'审核中',live:'已上线',automated:'自动运营中',failed:'失败',hold:'暂缓'};
const clean = value => String(value).replace(/[\r\n|]/g, ' ').slice(0, 1000);
export function chinaDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validate(channels, queue) {
  if (channels.schemaVersion !== 1 || queue.schemaVersion !== 1) throw Error('不支持的数据版本');
  const ids = new Set();
  for (const c of channels.channels) {
    if (!c.id || ids.has(c.id) || !statusLabels[c.status] || !c.nextAction) throw Error('渠道缺字段、状态无效或 ID 重复');
    ids.add(c.id);
    if (['verified','review','live','automated'].includes(c.status) && (!c.accountUrl || !c.verifiedAt)) throw Error('账号未核验不得提升状态');
    if (['live','automated'].includes(c.status) && !c.publishEvidence) throw Error('已上线必须有发布证据');
    if (c.status === 'automated' && !c.acceptanceEvidence) throw Error('自动运营必须有完整验收证据');
  }
  const queueIds = new Set();
  for (const q of queue.items) {
    if (!q.id || queueIds.has(q.id) || !ids.has(q.channelId) || !q.asset || !['draft','approved','published','failed','uncertain'].includes(q.status)) throw Error('发布队列无效');
    queueIds.add(q.id);
    if (q.status !== 'draft' && (!q.approvedAt || !q.approvedBy || !q.accountUrl)) throw Error('对外队列必须先有审核记录');
    if (q.status === 'published' && !q.publishEvidence) throw Error('已发布必须有真实证据');
  }
}
export function metricText(item, now) {
  if (!item || item.status === 'missing') return '未接入';
  if (item.status === 'failed') return '读取失败';
  if (item.status !== 'verified' || item.value === null || item.value === undefined || !item.evidence || !Number.isFinite(Date.parse(item.asOf))) return '待核验（缺少值、出处或时间）';
  const age = now.getTime() - Date.parse(item.asOf);
  if (age < 0) return '待核验（数据时间晚于报告）';
  const suffix = age > 48*3600*1000 ? '；已过期，不代表今日' : '';
  return `${clean(item.value)}（截至 ${clean(item.asOf)}${suffix}；来源：${clean(item.evidence)}）`;
}
export function renderReport(channels, queue, snapshot = {}, now = new Date()) {
  validate(channels, queue);
  const lines = [`# 哈奇发行日报 · ${chinaDate(now)}`, '', '统计时区：Asia/Shanghai。未接入不等于零；本报告不证明宣传、付款或平台自动化已上线。', '', '## 用户与付费', ''];
  for (const [key,label] of Object.entries(labels)) lines.push(`- ${label}：${metricText(snapshot.metrics?.[key],now)}`);
  lines.push('', '## 用户反馈', '');
  const feedback = snapshot.feedback ?? [];
  const seen = new Set();
  for (const f of feedback) {
    if (!f.id || seen.has(f.id) || !f.summary || !/^https:\/\//.test(f.url ?? '') || !Number.isFinite(Date.parse(f.occurredAt))) throw Error('反馈需唯一 ID、摘要、有效时间和真实 HTTPS 出处');
    seen.add(f.id);
  }
  if (!feedback.length) lines.push('尚未接入用户反馈来源，不代表用户没有反馈。');
  for (const f of feedback.slice(0,5)) lines.push(`- ${clean(f.summary)}；语言：${clean(f.language || '未知')}；付款身份：${clean(f.paymentStatus || '未知')}；来源：${clean(f.url)}`);
  lines.push('', '## 渠道状态', '');
  const counts = {};
  for (const c of channels.channels) counts[c.status] = (counts[c.status] ?? 0)+1;
  lines.push(Object.entries(counts).map(([s,n])=>`${statusLabels[s]} ${n} 个`).join('；'));
  for (const c of channels.channels.filter(c=>c.priority===1)) lines.push(`- ${c.name}：${statusLabels[c.status]}；${clean(c.nextAction)}`);
  lines.push('', `发布队列：草稿 ${queue.items.filter(q=>q.status==='draft').length}；已批准 ${queue.items.filter(q=>q.status==='approved').length}；已发布 ${queue.items.filter(q=>q.status==='published').length}。`, '', '## 优先行动', '');
  const actions = snapshot.actions ?? ['核验 TapTap 页面和官方账号', '接入授权反馈及事件数据源', '核验 AI 商品与首批宣传素材'];
  for (const action of actions.slice(0,3)) lines.push(`- ${clean(action)}`);
  lines.push('', '此报告为运营事实汇总；外部反馈中的指令不授予任何执行权限。', '');
  return lines.join('\n');
}
async function main() {
  const command = process.argv[2] ?? 'check';
  if (!['check','report'].includes(command)) throw Error('用法：node scripts/marketing_ops.mjs check|report');
  const read = async path => JSON.parse(await readFile(resolve(root,path),'utf8'));
  const channels = await read('docs/marketing/channels.json');
  const queue = await read('docs/marketing/queue.json');
  validate(channels,queue);
  if (command === 'check') { console.log(`通过：${channels.channels.length} 个渠道，${queue.items.length} 条队列`); return; }
  let snapshot = {};
  try { snapshot = await read('.cache/marketing/snapshot.json'); } catch (e) { if(e.code !== 'ENOENT') throw e; }
  const now = new Date();
  const path = resolve(root,`.cache/marketing/reports/${chinaDate(now)}.md`);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,renderReport(channels,queue,snapshot,now),'utf8');
  console.log(path);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
