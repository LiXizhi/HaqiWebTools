import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(rootDir, '..');
const simDir = path.join(repoRoot, 'HaqiCombatSim');

export default defineConfig({
  publicDir: simDir,
  build: {
    emptyOutDir: true,
    outDir: path.join(rootDir, 'dist'),
    target: 'es2020'
  },
  server: {
    host: '127.0.0.1',
    port: 4173
  },
  preview: {
    host: '127.0.0.1',
    port: 4174
  }
});
