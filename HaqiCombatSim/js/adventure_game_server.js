// Browser IO only. Credentials/tickets live in closures and never in saves or URLs.
export const GAME_SERVER_URL = 'https://us1.gameserver.keepwork.com';
export function createGameServerSession({getState, getCredentials, onStatus = () => {},
    gatewayUrl = GAME_SERVER_URL, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket,
    now = Date.now, setTimer = setInterval, clearTimer = clearInterval} = {}) {
    const gateway = new URL(gatewayUrl);
    if (gateway.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(gateway.hostname)) throw Error('游戏服必须使用安全连接');
    let socket = null, abort = null, generation = 0, identity = '', online = false;
    let room = '', nextAttempt = 0, failures = 0, timer, handshakeTimer, stopped = true, connecting = false;
    let lastStatus = '';
    const status = value => { if (value !== lastStatus) { lastStatus = value; onStatus(value); } };
    function disconnect() {
        generation++; clearTimeout(handshakeTimer); abort?.abort(); abort = null; connecting = false; online = false;
        const previous = socket; socket = null; previous?.close();
    }
    function fail(epoch, denied = false) {
        if (epoch !== generation) return;
        disconnect(); failures++; nextAttempt = now() + (denied ? 30000 : Math.min(30000, 1000 * 2 ** Math.min(failures, 5)));
        status(denied ? '游戏服身份验证失败，请重新登录 Keepwork' : '游戏服连接中断，正在重连；本地进度仍保留');
    }
    async function connect(state, credentials) {
        const epoch = ++generation;
        const isCurrent = () => {
            if (epoch !== generation) return false;
            const latest = getState();
            try {
                const auth = getCredentials();
                if (latest?.owner === state.owner && latest?.roleId === state.roleId
                    && auth?.username === credentials.username && auth?.token === credentials.token) return true;
            } catch { /* Expired/changed session must not complete its old handshake. */ }
            disconnect(); return false;
        };
        connecting = true; abort = new AbortController();
        const deadline = setTimeout(() => { if (epoch === generation) fail(epoch); }, 15000);
        handshakeTimer = deadline;
        status('正在验证游戏服登录');
        try {
            const response = await fetchImpl(new URL('/api/join', gateway), {
                method: 'POST', headers: {'content-type': 'application/json', Authorization: `Bearer ${credentials.token}`},
                body: JSON.stringify({username: credentials.username, project: 'haqi', roleId: state.roleId,
                    roomId: state.roomId, x: state.x, y: state.y}), signal: abort.signal,
            });
            if (!isCurrent()) return;
            if (!response.ok) { fail(epoch, response.status === 401 || response.status === 403); return; }
            const assignment = await response.json();
            if (!isCurrent()) return;
            if (assignment.username !== credentials.username || !assignment.ticket || !assignment.playerId) throw Error('identity');
            const url = new URL(assignment.url);
            if (url.hostname !== gateway.hostname || (gateway.protocol === 'https:' && url.protocol !== 'wss:')
                || !['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('socket-url');
            socket = new WebSocketImpl(url.href);
            const current = socket;
            current.onopen = () => {
                if (!isCurrent()) { current.close(); return; }
                current.send(JSON.stringify({type: 'hello', playerId: assignment.playerId, ticket: assignment.ticket,
                    instanceId: assignment.instanceId, roomId: state.roomId, name: state.name,
                    appearance: {}, x: state.x, y: state.y}));
            };
            current.onmessage = event => {
                if (!isCurrent()) return;
                let message;
                try { message = JSON.parse(event.data); } catch { fail(epoch); return; }
                if (message.type === 'welcome') {
                    if (message.self?.id !== assignment.playerId || message.roomId !== state.roomId) { fail(epoch, true); return; }
                    clearTimeout(deadline); connecting = false; online = true; failures = 0; room = state.roomId;
                    status('已连接游戏服务器');
                } else if (message.type === 'reject') fail(epoch, true);
            };
            current.onerror = () => fail(epoch);
            current.onclose = () => fail(epoch);
        } catch { fail(epoch); }
        finally { if (!socket || epoch !== generation) clearTimeout(deadline); }
    }
    function tick() {
        if (stopped) return;
        const state = getState();
        let credentials;
        try { credentials = state?.owner ? getCredentials() : null; } catch { credentials = null; }
        if (!state?.owner || !credentials?.token || credentials.username !== state.owner) {
            if (identity || socket || connecting) disconnect();
            identity = ''; status('游戏服未连接'); return;
        }
        // Token participates in the in-memory lifecycle only; never report this key.
        const key = JSON.stringify([state.owner, state.roleId, credentials.token]);
        if (identity !== key) { disconnect(); identity = key; nextAttempt = 0; failures = 0; }
        if (!socket && !connecting && now() >= nextAttempt) { void connect(state, credentials); return; }
        if (online && socket?.readyState === 1) {
            if (room !== state.roomId) {
                socket.send(JSON.stringify({type: 'enterRoom', roomId: state.roomId, x: state.x, y: state.y})); room = state.roomId;
            } else socket.send(JSON.stringify({type: 'move', x: state.x, y: state.y, facing: state.facing || 0}));
        }
    }
    return {
        get connected() { return online; },
        start() { if (!stopped) return; stopped = false; timer = setTimer(tick, 1000); tick(); },
        stop() { stopped = true; clearTimer(timer); disconnect(); identity = ''; status('游戏服未连接'); },
        tick,
    };
}
