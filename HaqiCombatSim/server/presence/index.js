// Local dev entry: one gateway and one stateless game server on this machine.

import {fileURLToPath} from 'node:url';
import {createRegistry} from './gateway/registry.js';
import {startGateway} from './gateway/server.js';
import {createLocalSpawner} from './gateway/spawn.js';
import {loadRoomCatalog} from './protocol.js';

export async function startPresence({
    host = process.env.PRESENCE_HOST || '127.0.0.1',
    gatewayPort = Number(process.env.PRESENCE_GATEWAY_PORT || 8787),
    gamePort = Number(process.env.PRESENCE_GAME_PORT || 8788),
    machineId = process.env.PRESENCE_MACHINE_ID || 'local-1',
} = {}) {
    const catalog = loadRoomCatalog();
    const registry = createRegistry({catalog});
    const local = createLocalSpawner({host, catalog});
    const gateway = await startGateway({registry, host, port: gatewayPort, local});
    local.gatewayUrl = gateway.url;
    const game = await local.add({port: gamePort, machineId});
    if (!game.ok) throw new Error(game.error || 'spawn');
    return {
        gateway,
        game,
        local,
        close: async () => {
            await local.close();
            await gateway.close();
        },
    };
}

const entry = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entry) {
    const presence = await startPresence();
    console.log(`在场网关 ${presence.gateway.url}/admin`);
    console.log(`游戏服 ${presence.game.url}`);
    console.log(`presence ready gateway=${presence.gateway.url}/admin game=${presence.game.url}`);
    const shutdown = async () => {
        await presence.close();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
