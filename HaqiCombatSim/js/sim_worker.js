// sim_worker.js — Web Worker：接收数据集 + 参数 + job，跑完返回统计。
// 消息协议：
//   → { type:'init', dataset, params }            缓存数据集与参数（resolve 一次）
//   → { type:'run', job, reqId }                   执行 job；期间发送 { type:'progress', reqId, done, total }
//   ← { type:'result', reqId, stats } | { type:'error', reqId, message }
import { resolveParams } from './combat_params_core.js';
import { normalizeDataset } from './data_core.js';
import { runJob } from './sim_batch_core.js';

let resolved = null;

self.onmessage = (e) => {
    const msg = e.data;
    try {
        if (msg.type === 'init') {
            const dataset = normalizeDataset(msg.dataset);
            resolved = resolveParams(dataset, msg.params);
            self.postMessage({ type: 'ready' });
        } else if (msg.type === 'run') {
            if (!resolved) throw new Error('worker not initialized');
            const stats = runJob(resolved, msg.job, (done, total) => {
                self.postMessage({ type: 'progress', reqId: msg.reqId, done, total });
            });
            self.postMessage({ type: 'result', reqId: msg.reqId, stats });
        }
    } catch (err) {
        self.postMessage({ type: 'error', reqId: msg.reqId, message: String(err && err.stack || err) });
    }
};
