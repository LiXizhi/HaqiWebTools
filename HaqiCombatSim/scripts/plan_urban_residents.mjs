import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const source = 'art-references/urban-residents/designs.json';
const designs = read(source);
const manifest = read('data/hero-preview.json');
const reference = (local, role) => ({ local, role, sha256: createHash('sha256').update(readFileSync(new URL(local, root))).digest('hex') });
const references = Object.fromEntries(['male', 'female'].map(gender => [gender, {
  head: reference(manifest.heads[gender === 'male' ? 'elf-boy' : 'elf-girl'].local, '只参考头部比例、镜头和16方向排列；更换五官、发型和耳形'),
  walk: reference(`assets/hero-preview/${gender}-walk-ref.webp`, '固定步行动作、比例和脖子定位'),
  walkReview: read(`art-references/walk-reference/${gender}-walk-ref.json`).status,
}]));
const requests = [];
for (const resident of designs.residents) {
  const { gender, id, name, age, skin, head, clothes, number } = resident;
  const headId = `urban-${id}-${gender === 'female' ? 'girl' : 'boy'}`;
  const bodyId = `${gender}-urban-${id}`;
  const common = `现代城市游戏美术，半写实绘制与自然柔和光照；保持参考的大头小身体比例及俯视镜头，不改成人体写实比例。${age}，${skin}。普通人耳朵，无魔法、精灵耳、武器、文字或品牌。真正透明背景，无地面、阴影、格线。`;
  const items = [
    { kind: 'head', id: `urban-${id}`, ref: 'head', grid: { columns: 4, rows: 4 },
      prompt: `${common}头部设计：${head}。同一人物的16方向独立头部，不含脖子、肩膀或身体。4列4行，行优先从正面开始向画面左侧每格旋转22.5度：0正面、4左侧、8背面、12右侧；背面不露五官。各格颅骨尺寸一致，完整留白，头发不可跨格。` },
    { kind: 'walk', id: bodyId, ref: 'walk', grid: { columns: 7, rows: 4 },
      prompt: `${common}仅替换参考中全部28格人物的服装和露出皮肤颜色：${clothes}。无头，保留短脖子。每格保持原位置、肢体姿势、步态、身体尺寸、颈部连接点和脚底基线。7列4行；各行正面、左侧、右侧、背面；前6列走路，最后一列静止。手中不持物，配件贴身。` },
  ];
  for (const item of items) requests.push({
    number, name, gender, headId, bodyId, pilot: designs.pilotNumbers.includes(number),
    status: 'planned', kind: item.kind, id: item.id,
    reference: references[gender][item.ref], grid: item.grid, prompt: item.prompt,
    output: `assets/hero-preview/urban/${item.id}.webp`,
  });
}
const batch = {
  version: 1, designSource: source, status: 'planned', generator: 'built-in image_gen', references,
  budgetBytes: 200000, requests,
  rules: [
    '先检查01、08、13、19四组风格与连接；所有服装独立引用固定同性别参考。',
    '头部和身体分离，儿童及老人沿用既有几何；同性别模板混搭，跨肤色需对应皮肤变体。',
    '保存实际生成参考哈希、完整提示词、源图哈希及原始输出；planned不表示生成或验收通过。',
    '不使用现有恢复基础脖子肤色的打包逻辑覆盖新肤色；保留新服装透明轮廓。',
    '逐款逐方向校准下颌/耳下颈部，不用长发最低点当连接点。',
    '上线前每张WebP不超过200000字节，登记永久Keepwork CDN并核验远端SHA-256、alpha及CORS。',
  ],
};
const target = 'art-references/urban-residents/batch.json';
const document = [
  '# 现代城市居民设计与生成清单', '',
  '20个独立头部、20套步行服装。头部与身体分离生成，重点检查转头与四向步行动画中的头颈连接点。生成状态与来源登记在独立素材记录中。', '',
  `设计源：\`${source}\`；可重建请求：\`node scripts/plan_urban_residents.mjs\`。`, '',
  designs.style + '。儿童与老人沿用现有男女模板，年龄由五官、发际线、白发与服装表达。', '',
  '| 编号 | 角色 | 年龄／性别 | 头部 | 身体服装 |',
  '| --- | --- | --- | --- | --- |',
  ...designs.residents.map(row => `| ${String(row.number).padStart(2, '0')} | ${row.name} | ${row.age}／${row.gender === 'male' ? '男' : '女'} | ${row.skin}；${row.head} | ${row.clothes} |`),
  '', '## 生成与换装', '',
  ...batch.rules.map(rule => '- ' + rule), '',
  '头图4×4、16方向；步行身体7×4、四方向六帧与一帧静止。头部与身体分别使用稳定headId/bodyId，不添加存档字段。眼镜归头部；书包、围裙、贴身工具袋归身体；职业帽与安全帽留待独立配件。', '',
  '## 部件连接点视觉验收', '',
  '入口：[现代居民合成预览](../tests/fixtures/urban-residents.html)。使用正式分层渲染类，显示四向站立、六帧步行、头部左右转45度及可见连接点。仅查看素材，不接触玩家存档。', '',
  '逐款逐角度检查下颌与短脖子重叠、衣领无缝衔接、转头不跳动、步态切换不漂移、发型和配件不跨格。不能仅凭统一锚点或图像哈希判定视觉验收通过。', '',
  '## 已交付（2026-10-03）', '',
  '20个头部与20套身体已生成、打包并登记到两份正式清单。实际资产与生成来源见 `art-references/urban-residents/assets.json`；请求清单的planned仅表示原始请求，完成状态以实际资产记录为准。', '',
  '全部40张WebP为139876–197602字节；永久Keepwork CDN已逐张核验SHA-256和CORS。头部16方向、身体28格；辫发中学生按下颌校准连接点与解剖头高，避免辫子末端缩小脸部。', '',
  '本地逐组检查560个身体合成帧与320个头部方向，CDN模式全部20组通过解码、透明及Canvas像素读取。独立换头、换身体及左右45度转头另行抽查；同模板200种组合通过存档往返测试。此验收覆盖部件连接，不涉及坐骑。', '',
  '运行 `python scripts/prepare_urban_residents.py` 重建本地打包；修改锚点后在预览页复查，再更新review。登记脚本要求40份资产完整、CDN存在且visual-reviewed。跨肤色组合仍需身体肤色变体。', '',
].join('\n');
const outputs = [[target, JSON.stringify(batch, null, 2) + '\n'], ['docs/urban-residents.md', document]];
for (const [path, text] of outputs) {
  if (process.argv.includes('--check')) {
    if (readFileSync(new URL(path, root), 'utf8') !== text) throw new Error(`生成清单过期：${path}`);
  } else writeFileSync(new URL(path, root), text, 'utf8');
}
console.log(`${process.argv.includes('--check') ? 'Checked' : 'Planned'} ${designs.residents.length} residents / ${requests.length} requests in ${fileURLToPath(new URL(target, root))}`);
