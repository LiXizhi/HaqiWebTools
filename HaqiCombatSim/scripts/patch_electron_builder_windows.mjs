// electron-builder 26 locks the unpack directory and then renames it.
// Windows rejects that rename while the lock file is open (EPERM).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(root, 'node_modules', 'app-builder-lib', 'out', 'util', 'electronGet.js');
const source = fs.readFileSync(file, 'utf8');
if (source.includes('attempt === 7')) {
    console.log('electron-builder Windows unpack patch already applied');
} else {
    let next = source;
    if (!source.includes('releasedEarly')) {
        next = next
            .replace(
                '    const release = await lockfile.lock(tmpDir, {',
                '    let releasedEarly = false;\n    const release = await lockfile.lock(tmpDir, {',
            )
            .replace(
                `        await fs.rm(dir, { recursive: true, force: true });
        await fs.rename(tmpDir, dir);
    }
    finally {
        await release().catch(err => builder_util_1.log.warn({ err }, "failed to release lockfile"));
    }`,
                `        await fs.rm(dir, { recursive: true, force: true });
        await release();
        releasedEarly = true;
        await fs.rename(tmpDir, dir);
    }
    finally {
        if (!releasedEarly) await release().catch(err => builder_util_1.log.warn({ err }, "failed to release lockfile"));
    }`,
            );
    }
    next = next.replace(
        `        await release();
        releasedEarly = true;
        await fs.rename(tmpDir, dir);`,
        `        await release();
        releasedEarly = true;
        let renamed = false;
        for (let attempt = 0; attempt < 8 && !renamed; attempt++) {
            try {
                await fs.rename(tmpDir, dir);
                renamed = true;
            } catch (error) {
                if (error.code !== "EPERM" || attempt === 7) throw error;
                await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
            }
        }`,
    );
    if (next === source) throw new Error('未能修补 electron-builder 的 Windows 解包重命名');
    fs.writeFileSync(file, next);
    console.log('已修补 electron-builder 的 Windows 解包重命名');
}
