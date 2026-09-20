import { connectHaqiRest } from './npl_rest.js';

function checkedResponse(value) {
    if (!value || value.issuccess === false || Number(value.errorcode || value.errorCode || 0) !== 0) throw Error('原服读取失败，请稍后重试。');
    return value;
}

export async function readOriginalCharacter({ sdk, fetchImpl = globalThis.fetch, connect = connectHaqiRest, signal, onProgress = () => {} }) {
    const token = sdk?.token;
    if (!token) throw Error('请先登录 Keepwork。');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    let client, lastRequestAt = 0;
    const close = () => client?.close();
    controller.signal.addEventListener('abort', close);
    const timer = setTimeout(abort, 120000);
    const check = () => {
        if (controller.signal.aborted) throw Error('读取已取消或超时。');
        if (sdk.token !== token) throw Error('登录账号已变化，请重新导入。');
    };
    const http = async (url, body) => {
        check();
        const response = await fetchImpl(url, {
            method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error', signal: controller.signal,
            headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        check();
        if (!response.ok) throw Error('Keepwork 授权读取失败，请重新登录或稍后重试。');
        const result = await response.json();check();return result;
    };
    const request = async (name, params = {}) => {
        check();
        const delay = Math.max(0, 350 - (Date.now() - lastRequestAt));
        if (delay) await new Promise((resolve, reject) => {
            const cancel = () => { clearTimeout(waitTimer);reject(Error('读取已取消或超时。')); };
            const waitTimer = setTimeout(() => { controller.signal.removeEventListener('abort', cancel);resolve(); }, delay);
            controller.signal.addEventListener('abort', cancel, { once: true });
        });
        check();lastRequestAt = Date.now();
        const value = checkedResponse(await client.request(name, params));check();return value;
    };
    try {
        onProgress('正在核验 Keepwork 登录…');
        const profile = (await http('https://keepwork.com/api/wiki/models/user/getProfile')).data;
        if (!profile?.username || profile.idcardAuth?.status !== 0) throw Error('请先在原版魔法哈奇完成实名认证，再导入角色。');
        const time = await http('https://api.keepwork.com/core/v0/keepworks/currentTime');
        const timestamp = Number(time.timestamp);
        const id = profile.idcardAuth.idNum;
        if (!Number.isFinite(timestamp) || timestamp <= 0 || typeof id !== 'string' || !/^(?:\d{15}|\d{17}[\dXx])$/.test(id)) throw Error('无法核验实名状态，请先进入原版魔法哈奇。');
        const year = id.length === 18 ? Number(id.slice(6, 10)) : 1900 + Number(id.slice(6, 8));
        const age = new Date(timestamp + 8 * 3600000).getUTCFullYear() - year;
        if (age < 0 || age > 150) throw Error('无法核验实名状态。');
        if (age < 18) throw Error('当前导入暂不支持核验未成年账号的剩余游戏时长，请使用原版客户端。');
        onProgress('正在连接魔法哈奇…');
        client = await connect();check();
        const ping = await request('Ping');
        if (!Number.isSafeInteger(ping.ver) || ping.ver <= 0) throw Error('原服协议版本无效。');
        const oauth = await http('https://keepwork.com/api/wiki/models/oauth_app/agreeOauth', { username: profile.username, client_id: '1000003' });
        if (typeof oauth?.data?.code !== 'string' || !oauth.data.code) throw Error('未获得魔法哈奇授权，请稍后重试。');
        const auth = await request('AuthUser', { username: profile.username, plat: 7, token: oauth.data.code, oid: profile.username.toLowerCase(), from: 7, loginplat: 1, ver: ping.ver });
        const nid = Number(auth.nid);
        if (auth.issuccess !== true || !Number.isSafeInteger(nid) || nid <= 0) throw Error('魔法哈奇登录失败，或该账号尚未创建原版角色。');
        onProgress('正在读取人物和背包…');
        const character = await request('Power_Users.GetUserAndDragonInfo', { nid });
        if (Number(character.user?.nid) !== nid || !character.dragon) throw Error('原版人物资料不完整，未创建导入角色。');
        const bags = await request('Items.GetMyBags');
        if (typeof bags.bagids !== 'string' || !/^(?:\d+(?:,\d+)*)?$/.test(bags.bagids)) throw Error('原服背包目录格式暂不支持。');
        const bagIds = bags.bagids ? bags.bagids.split(',').map(Number) : [];
        if (bagIds.length > 100 || bagIds.some(bag => !Number.isSafeInteger(bag)) || new Set(bagIds).size !== bagIds.length) throw Error('原服背包目录无效。');
        const inventory = [];
        for (const bag of bagIds) {
            onProgress(`正在读取背包 ${inventory.length + 1}/${bagIds.length}…`);
            const result = await request('Items.GetItemsInBag', { nid, bag });
            if (!Array.isArray(result.items) || result.items.length > 10000) throw Error('原服背包内容格式暂不支持。');
            inventory.push({ bag, items: result.items.map(item => ({ guid: item.guid, gsid: item.gsid, position: item.position, copies: item.copies, clientdata: item.clientdata, serverdata: item.serverdata })) });
        }
        check();
        return { owner: profile.username, nid, name: character.user.nickname, school: character.dragon.combatschool, level: character.dragon.combatlel, xp: character.dragon.combatexp, inventory };
    } finally {
        clearTimeout(timer);signal?.removeEventListener('abort', abort);controller.signal.removeEventListener('abort', close);close();
    }
}