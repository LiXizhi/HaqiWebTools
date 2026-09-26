// Copies the unpacked Electron app into steam-depot/ for a SteamPipe content root.
// Replace APP_ID and DEPOT_ID before uploading. This does not call Steamworks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shellDist = path.join(root, 'shell-dist');
const pairs = [
    ['win-unpacked', 'windows'],
    ['mac-unpacked', 'mac'],
    ['linux-unpacked', 'linux'],
];
const staged = [];
for (const [from, name] of pairs) {
    const source = path.join(shellDist, from);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(root, 'steam-depot', name);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
    staged.push(name);
}
if (!staged.length) throw new Error('shell-dist 中没有 unpacked 目录，请先运行桌面打包');
const vdf = `"AppBuild"
{
\t"AppID" "APP_ID"
\t"Desc" "Haqi adventure local-asset build"
\t"BuildOutput" "${path.join(root, 'steam-depot', 'output').replaceAll('\\', '/')}"
\t"ContentRoot" "${path.join(root, 'steam-depot', staged[0]).replaceAll('\\', '/')}"
\t"Depots"
\t{
\t\t"DEPOT_ID"
\t\t{
\t\t\t"FileMapping"
\t\t\t{
\t\t\t\t"LocalPath" "*"
\t\t\t\t"DepotPath" "."
\t\t\t\t"recursive" "1"
\t\t\t}
\t\t}
\t}
}
`;
fs.writeFileSync(path.join(root, 'steam-depot', 'app_build.vdf'), vdf);
console.log(`Steam 内容目录：${staged.join('、')}。上传前把 app_build.vdf 里的 APP_ID 和 DEPOT_ID 换成 Steamworks 后台的数字。`);
