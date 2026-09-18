// sim_pool.js — Worker 池：并行执行 jobs，流式进度回调，支持取消。
// 无 Worker 环境（如 file:// 下某些浏览器）时自动回退到主线程串行执行。
import { resolveParams } from './combat_params_core.js';
import { runJob } from './sim_batch_core.js';

export class SimPool {
    constructor(opts = {}) {
        this.size = opts.size || Math.max(1, Math.min(8, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : 2)));
        this.workerUrl = opts.workerUrl;
        this.workers = [];
        this.cancelled = false;
        this.useWorkers = typeof Worker !== 'undefined' && opts.useWorkers !== false;
    }

    async _spawn(dataset, params) {
        this.terminate();
        this.cancelled = false;
        if (!this.useWorkers) return;
        const plain = JSON.parse(JSON.stringify(dataset));
        const readies = [];
        for (let i = 0; i < this.size; i++) {
            const w = this.workerUrl
                ? new Worker(this.workerUrl, { type: 'module' })
                : new Worker(new URL('./sim_worker.js', import.meta.url), { type: 'module' });
            this.workers.push(w);
            readies.push(new Promise((res, rej) => {
                const onMsg = (e) => { if (e.data.type === 'ready') { w.removeEventListener('message', onMsg); res(); } };
                w.addEventListener('message', onMsg);
                w.addEventListener('error', (e) => rej(e.message || e), { once: true });
                w.postMessage({ type: 'init', dataset: plain, params });
            }));
        }
        try {
            await Promise.all(readies);
        } catch (e) {
            console.warn('worker init failed, fallback to main thread', e);
            this.terminate();
            this.useWorkers = false;
        }
    }

    /**
     * @param jobs buildJobs() 输出
     * @param onProgress ({ doneGames, totalGames, doneJobs, totalJobs, stats(最新完成的 job) })
     * @return stats[]
     */
    async run(dataset, params, jobs, onProgress) {
        await this._spawn(dataset, params);
        const totalGames = jobs.reduce((a, j) => a + j.games, 0);
        const results = [];
        let doneGames = 0;
        let doneJobs = 0;
        const progressByJob = {};
        const report = (stats) => {
            const partial = Object.values(progressByJob).reduce((a, b) => a + b, 0);
            if (onProgress) onProgress({ doneGames: doneGames + partial, totalGames, doneJobs, totalJobs: jobs.length, stats });
        };

        if (!this.useWorkers) {
            const resolved = resolveParams(dataset, params);
            for (const job of jobs) {
                if (this.cancelled) break;
                const st = runJob(resolved, job, (d) => { progressByJob[job.id] = d; report(null); });
                delete progressByJob[job.id];
                doneGames += job.games; doneJobs++;
                results.push(st);
                report(st);
                await new Promise(r => setTimeout(r, 0));
            }
            return results;
        }

        let next = 0;
        let reqSeq = 0;
        const runOn = (w) => new Promise((resolve) => {
            const loop = () => {
                if (this.cancelled || next >= jobs.length) return resolve();
                const job = jobs[next++];
                const reqId = ++reqSeq;
                const onMsg = (e) => {
                    const m = e.data;
                    if (m.reqId !== reqId) return;
                    if (m.type === 'progress') { progressByJob[job.id] = m.done; report(null); }
                    else if (m.type === 'result') {
                        w.removeEventListener('message', onMsg);
                        delete progressByJob[job.id];
                        doneGames += job.games; doneJobs++;
                        results.push(m.stats);
                        report(m.stats);
                        loop();
                    } else if (m.type === 'error') {
                        w.removeEventListener('message', onMsg);
                        console.error('worker error', m.message);
                        delete progressByJob[job.id];
                        doneJobs++;
                        report(null);
                        loop();
                    }
                };
                w.addEventListener('message', onMsg);
                w.postMessage({ type: 'run', job, reqId });
            };
            loop();
        });
        await Promise.all(this.workers.map(runOn));
        return results;
    }

    cancel() { this.cancelled = true; this.terminate(); }

    terminate() {
        for (const w of this.workers) w.terminate();
        this.workers = [];
    }
}
