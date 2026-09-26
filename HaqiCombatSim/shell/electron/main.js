// Desktop shell for the local-asset build. Serves app-dist on loopback so
// ES modules and fetch work; file:// cannot load this game.
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.ogg': 'audio/ogg',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
};

function contentRoot() {
    if (app.isPackaged) return path.join(process.resourcesPath, 'app');
    return path.resolve(here, '../../app-dist');
}

function localFile(root, requestPath) {
    let relative = decodeURIComponent(requestPath.split('?')[0]);
    if (relative === '/' || relative === '') relative = '/Haqi.html';
    relative = relative.replace(/^\/+/, '');
    const file = path.resolve(root, relative);
    const base = path.resolve(root);
    if (file !== base && !file.startsWith(base + path.sep)) return null;
    return file;
}

function listen(root) {
    const server = http.createServer((request, response) => {
        const file = localFile(root, new URL(request.url, 'http://127.0.0.1').pathname);
        if (!file) {
            response.writeHead(403).end();
            return;
        }
        fs.readFile(file, (error, bytes) => {
            if (error) {
                response.writeHead(404).end();
                return;
            }
            const type = mime[path.extname(file).toLowerCase()] || 'application/octet-stream';
            response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
            response.end(bytes);
        });
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

let server;
async function openGame() {
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(here, 'icons', 'magic-haqi.png'));
    const root = contentRoot();
    if (!fs.existsSync(path.join(root, 'Haqi.html'))) throw new Error(`找不到本地冒险入口：${root}`);
    if (!server) server = await listen(root);
    const { port } = server.address();
    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        title: '魔法哈奇',
        icon: path.join(here, 'icons', process.platform === 'win32' ? 'magic-haqi.ico' : 'magic-haqi.png'),
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    await window.loadURL(`http://127.0.0.1:${port}/Haqi.html`);
}

app.whenReady().then(openGame).catch(error => {
    console.error(error);
    app.exit(1);
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openGame().catch(error => { console.error(error); app.exit(1); });
});
