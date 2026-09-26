// Builds the Electron installer for the current OS. macOS images are produced on a Mac.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
await import(pathToFileURL(path.join(root, 'scripts', 'patch_electron_builder_windows.mjs')).href);
const flag = process.platform === 'darwin' ? '--mac' : process.platform === 'linux' ? '--linux' : '--win';
const builder = path.join(root, 'node_modules', 'electron-builder', 'cli.js');
const child = spawn(process.execPath, [builder, '--config', 'shell/electron/electron-builder.yml', flag], {
    cwd: root,
    stdio: 'inherit',
});
child.on('exit', code => process.exit(code ?? 1));
